import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SourcesService } from '../sources/sources.service';
import { AgentGatewayService } from '../agent/agent-gateway.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { AppSettingsService } from '../settings/app-settings.service';
import { Source } from '../sources/entities/source.entity';

const ALLOWED_INTERVALS = new Set([5, 15, 30]);

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  /** Prevents overlapping cron ticks while a batch is still running. */
  private cronTickInFlight = false;
  /** Source IDs with an active in-process crawl. */
  private readonly inFlightSources = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly appSettings: AppSettingsService,
    private readonly sourcesService: SourcesService,
    @Inject(forwardRef(() => AgentGatewayService))
    private readonly agentGatewayService: AgentGatewayService,
    private readonly agentRunsService: AgentRunsService,
  ) {}

  onModuleInit() {
    this.logger.log(
      'SchedulerService initialized — cron: every 1 minute (DB crawl_scheduler_enabled)',
    );
  }

  async isEnabled(): Promise<boolean> {
    return this.appSettings.isCrawlSchedulerEnabled();
  }

  async setEnabled(value: boolean): Promise<boolean> {
    await this.appSettings.setCrawlSchedulerEnabled(value);
    this.logger.log(`Scheduler ${value ? 'enabled' : 'disabled'} (persisted)`);
    return value;
  }

  private effectiveIntervalMinutes(source: Source): number {
    const m = source.crawl_interval_minutes;
    return ALLOWED_INTERVALS.has(m) ? m : 15;
  }

  private selectDueSources(sources: Source[]): Source[] {
    const now = Date.now();
    return sources.filter((s) => {
      if (this.inFlightSources.has(s.id)) return false;
      if (!s.last_crawled_at) return true;
      const elapsed = now - new Date(s.last_crawled_at).getTime();
      const intervalMs = this.effectiveIntervalMinutes(s) * 60_000;
      return elapsed >= intervalMs;
    });
  }

  @Cron('0 * * * * *')
  async handleCron(): Promise<void> {
    if (this.cronTickInFlight) {
      return;
    }
    this.cronTickInFlight = true;
    try {
      const enabled = await this.appSettings.isCrawlSchedulerEnabled();
      if (!enabled) {
        return;
      }
      const active = await this.sourcesService.findActive();
      const due = this.selectDueSources(active);
      if (due.length === 0) {
        return;
      }
      this.logger.log(`Scheduled crawl: ${due.length} due source(s)`);
      await this.runCrawlsWithConcurrencyCap(due);
    } finally {
      this.cronTickInFlight = false;
    }
  }

  private async runCrawlsWithConcurrencyCap(sources: Source[]): Promise<void> {
    const concurrency = Math.max(
      1,
      this.config.get<number>('crawl.concurrency') || 3,
    );
    const pending = [...sources];
    while (pending.length > 0) {
      const batch = pending.splice(0, concurrency);
      await Promise.all(
        batch.map((source) => this.runSingleSourceCrawl(source)),
      );
    }
  }

  private async runSingleSourceCrawl(source: Source): Promise<void> {
    this.inFlightSources.add(source.id);
    try {
      await this.agentGatewayService.runCrawlAgent([source]);
    } catch (err) {
      this.logger.error(
        `Crawl failed for source ${source.id}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    } finally {
      this.inFlightSources.delete(source.id);
    }
  }

  /**
   * Queue an immediate crawl for every **active** source not already in-flight.
   * Runs in parallel up to `CRAWL_CONCURRENCY` (same as scheduled ticks).
   */
  async dispatchCrawlAllActive(): Promise<{
    ok: boolean;
    reason?: 'scheduler_disabled';
    queued_count: number;
    skipped_in_flight_count: number;
    source_ids: string[];
  }> {
    const enabled = await this.appSettings.isCrawlSchedulerEnabled();
    if (!enabled) {
      this.logger.warn('dispatchCrawlAllActive blocked — crawl_scheduler_enabled is false');
      return {
        ok: false,
        reason: 'scheduler_disabled',
        queued_count: 0,
        skipped_in_flight_count: 0,
        source_ids: [],
      };
    }

    const active = await this.sourcesService.findActive();
    const inFlight = active.filter((s) => this.inFlightSources.has(s.id));
    const toRun = active.filter((s) => !this.inFlightSources.has(s.id));

    if (toRun.length === 0) {
      this.logger.log(
        `Run-all: no sources to queue (${active.length} active, ${inFlight.length} already in-flight)`,
      );
      return {
        ok: true,
        queued_count: 0,
        skipped_in_flight_count: inFlight.length,
        source_ids: [],
      };
    }

    this.logger.log(
      `Run-all: queueing ${toRun.length} source(s) in parallel (max concurrency ${Math.max(1, this.config.get<number>('crawl.concurrency') || 3)}), ${inFlight.length} skipped (in-flight)`,
    );
    void this.runCrawlsWithConcurrencyCap(toRun);

    return {
      ok: true,
      queued_count: toRun.length,
      skipped_in_flight_count: inFlight.length,
      source_ids: toRun.map((s) => s.id),
    };
  }

  /**
   * Manual / immediate crawl for one source. Blocked when scheduler flag is off.
   */
  async dispatchSingleCrawl(
    sourceId: string,
  ): Promise<{ started: boolean; reason?: string; source_id: string }> {
    const enabled = await this.appSettings.isCrawlSchedulerEnabled();
    if (!enabled) {
      this.logger.warn(
        `dispatchSingleCrawl blocked for ${sourceId} — crawl_scheduler_enabled is false`,
      );
      return {
        started: false,
        reason: 'scheduler_disabled',
        source_id: sourceId,
      };
    }
    if (this.inFlightSources.has(sourceId)) {
      return { started: false, reason: 'already_running', source_id: sourceId };
    }
    const source = await this.sourcesService.findOne(sourceId);
    void this.runSingleSourceCrawl(source);
    return { started: true, source_id: sourceId };
  }

  async stopCrawl(): Promise<{
    abortedRuns: number;
    scheduler_disabled: boolean;
  }> {
    await this.appSettings.setCrawlSchedulerEnabled(false);
    const runningRuns = await this.agentRunsService.findRunning();
    for (const run of runningRuns) {
      this.agentGatewayService.requestAbort(run.id);
    }
    for (const run of runningRuns) {
      await this.agentRunsService.abort(run.id);
    }
    this.logger.warn(
      `Crawl stopped — scheduler disabled, signalled + persisted abort for ${runningRuns.length} run(s)`,
    );
    return {
      abortedRuns: runningRuns.length,
      scheduler_disabled: true,
    };
  }
}
