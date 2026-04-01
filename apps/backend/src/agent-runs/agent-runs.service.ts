import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { AgentRun } from './entities/agent-run.entity';
import { AgentStep } from './entities/agent-step.entity';

interface AddStepInput {
  step_number: number;
  type: 'think' | 'tool_call' | 'tool_result' | 'final';
  tool_name?: string;
  tool_input?: object;
  tool_output?: object;
  reasoning_text?: string;
  tokens_used?: number;
}

@Injectable()
export class AgentRunsService implements OnModuleInit {
  private readonly logger = new Logger(AgentRunsService.name);

  constructor(
    @InjectRepository(AgentRun)
    private readonly runRepo: Repository<AgentRun>,
    @InjectRepository(AgentStep)
    private readonly stepRepo: Repository<AgentStep>,
  ) {}

  onModuleInit() {
    this.logger.log('AgentRunsService initialized');
  }

  private staleRunMaxAgeMs(): number {
    const parsed = process.env.AGENT_RUN_STALE_MS
      ? parseInt(process.env.AGENT_RUN_STALE_MS, 10)
      : NaN;
    return Number.isFinite(parsed) && parsed >= 60_000
      ? parsed
      : 2 * 60 * 60 * 1000;
  }

  /** Call before reads that surface `running` status (crawl-status, runs list). */
  async reconcileStaleRunsIfNeeded(): Promise<void> {
    await this.reconcileStaleRunningRuns(this.staleRunMaxAgeMs());
  }

  async create(input: { task_type: string }): Promise<AgentRun> {
    const run = this.runRepo.create({
      task_type: input.task_type,
      status: 'running',
    });
    return this.runRepo.save(run);
  }

  async addStep(runId: string, input: AddStepInput): Promise<AgentStep> {
    const step = this.stepRepo.create({
      run_id: runId,
      step_number: input.step_number,
      type: input.type,
      tool_name: input.tool_name || null,
      tool_input: input.tool_input || null,
      tool_output: input.tool_output || null,
      reasoning_text: input.reasoning_text || null,
      tokens_used: input.tokens_used || 0,
    });
    const saved = await this.stepRepo.save(step);

    await this.runRepo.increment({ id: runId }, 'total_steps', 1);
    if (input.tokens_used) {
      await this.runRepo.increment(
        { id: runId },
        'total_tokens',
        input.tokens_used,
      );
    }

    return saved;
  }

  async complete(runId: string, content: unknown): Promise<AgentRun> {
    const run = await this.findOne(runId);
    if (run.status !== 'running') {
      return run;
    }
    run.status = 'completed';
    run.completed_at = new Date();

    if (Array.isArray(content)) {
      const textParts = content
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text);
      run.final_summary = textParts.join('') || 'Completed';
    } else {
      run.final_summary = String(content);
    }

    return this.runRepo.save(run);
  }

  async fail(runId: string, reason: string): Promise<AgentRun> {
    const run = await this.findOne(runId);
    if (run.status !== 'running') {
      return run;
    }
    run.status = 'failed';
    run.completed_at = new Date();
    run.final_summary = reason;
    return this.runRepo.save(run);
  }

  async abort(runId: string): Promise<AgentRun> {
    const run = await this.findOne(runId);
    if (run.status !== 'running') {
      return run;
    }
    run.status = 'aborted';
    run.completed_at = new Date();
    run.final_summary = 'Aborted by user';
    this.logger.warn(`Agent run ${runId} aborted`);
    return this.runRepo.save(run);
  }

  async findOne(id: string): Promise<AgentRun> {
    const run = await this.runRepo.findOne({
      where: { id },
      relations: ['steps'],
    });
    if (!run) throw new NotFoundException(`AgentRun ${id} not found`);
    return run;
  }

  async findAll(page = 1, limit = 20) {
    await this.reconcileStaleRunsIfNeeded();
    const [data, total] = await this.runRepo.findAndCount({
      order: { started_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async getSteps(runId: string, page = 1, limit = 50) {
    const [data, total] = await this.stepRepo.findAndCount({
      where: { run_id: runId },
      order: { step_number: 'ASC', created_at: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async findRunning(): Promise<AgentRun[]> {
    return this.runRepo.find({
      where: { status: 'running' as const },
      order: { started_at: 'DESC' },
    });
  }

  /**
   * Runs stuck in `running` (crash, restart, or agent never re-entered its loop)
   * cannot drive UI "crawl in progress". Mark them terminal so dashboards stay honest.
   */
  async reconcileStaleRunningRuns(maxAgeMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const running = await this.runRepo.find({
      where: { status: 'running' as const },
    });
    let n = 0;
    for (const r of running) {
      if (r.started_at.getTime() < cutoff.getTime()) {
        r.status = 'failed';
        r.completed_at = new Date();
        r.final_summary =
          'Run was still marked running after extended inactivity (server restart, stuck tool, or lost agent loop)';
        await this.runRepo.save(r);
        n += 1;
      }
    }
    if (n > 0) {
      this.logger.warn(
        `Reconciled ${n} stale running agent run(s) older than ${maxAgeMs}ms`,
      );
    }
    return n;
  }

  async findLastCompleted(): Promise<AgentRun | null> {
    return this.runRepo.findOne({
      where: [
        { status: 'completed' as const },
        { status: 'failed' as const },
      ],
      order: { completed_at: 'DESC' },
    });
  }

  async getRunsToday(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.runRepo.count({
      where: { started_at: MoreThanOrEqual(today) },
    });
  }

  async getLastRunAt(): Promise<Date | null> {
    const [last] = await this.runRepo.find({
      order: { started_at: 'DESC' },
      take: 1,
    });
    return last?.started_at || null;
  }
}
