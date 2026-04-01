import { Controller, Get, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SourcesService } from '../sources/sources.service';
import { SnapshotsService } from '../snapshots/snapshots.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { AppSettingsService } from '../settings/app-settings.service';
import { ok } from '../common/helpers/response.helper';

@Controller('dashboard')
export class DashboardController implements OnModuleInit {
  private readonly logger = new Logger(DashboardController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly appSettings: AppSettingsService,
    private readonly sourcesService: SourcesService,
    private readonly snapshotsService: SnapshotsService,
    private readonly agentRunsService: AgentRunsService,
  ) {}

  onModuleInit() {
    this.logger.log('DashboardController initialized — routes: GET /stats, GET /crawl-status');
  }

  @Get('stats')
  async getStats() {
    const [sourceStats, freshnessData, runsToday, lastRunAt] =
      await Promise.all([
        this.sourcesService.getStats(),
        this.snapshotsService.getAverageFreshness(),
        this.agentRunsService.getRunsToday(),
        this.agentRunsService.getLastRunAt(),
      ]);

    return ok({
      total_sources: sourceStats.total_sources,
      active_sources: sourceStats.active_sources,
      avg_freshness_score: freshnessData.avg,
      freshest_source: freshnessData.freshest
        ? {
            name: freshnessData.freshest.source?.name || 'Unknown',
            score: freshnessData.freshest.freshness_score,
            modified_at: freshnessData.freshest.modified_at,
          }
        : null,
      stalest_source: freshnessData.stalest
        ? {
            name: freshnessData.stalest.source?.name || 'Unknown',
            score: freshnessData.stalest.freshness_score,
            modified_at: freshnessData.stalest.modified_at,
          }
        : null,
      last_run_at: lastRunAt,
      runs_today: runsToday,
      ai_provider: this.config.get<string>('ai.provider') || 'gemini',
    });
  }

  @Get('crawl-status')
  async getCrawlStatus() {
    const scheduler_enabled = await this.appSettings.isCrawlSchedulerEnabled();
    await this.agentRunsService.reconcileStaleRunsIfNeeded();
    const [runningRuns, lastCompleted] = await Promise.all([
      this.agentRunsService.findRunning(),
      this.agentRunsService.findLastCompleted(),
    ]);

    const activeRun = runningRuns[0] ?? null;

    return ok({
      scheduler_enabled,
      active_run: activeRun
        ? {
            id: activeRun.id,
            task_type: activeRun.task_type,
            started_at: activeRun.started_at,
            total_steps: activeRun.total_steps,
          }
        : null,
      last_completed_run: lastCompleted
        ? {
            id: lastCompleted.id,
            status: lastCompleted.status,
            completed_at: lastCompleted.completed_at,
            final_summary: lastCompleted.final_summary,
          }
        : null,
    });
  }
}
