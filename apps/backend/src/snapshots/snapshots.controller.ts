import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Logger,
  OnModuleInit,
  Header,
} from '@nestjs/common';
import { SnapshotsService } from './snapshots.service';
import { ComparisonService } from './comparison.service';
import { ok, paginated } from '../common/helpers/response.helper';

@Controller('snapshots')
export class SnapshotsController implements OnModuleInit {
  private readonly logger = new Logger(SnapshotsController.name);

  constructor(
    private readonly snapshotsService: SnapshotsService,
    private readonly comparisonService: ComparisonService,
  ) {}

  onModuleInit() {
    this.logger.log(
      'SnapshotsController initialized — routes: GET /compare, POST /compare-analysis, GET /compare-history, GET /compare-analysis/:id, GET /:sourceId/history',
    );
  }

  @Get('compare')
  @Header('Cache-Control', 'no-store')
  async compare() {
    const snapshots = await this.snapshotsService.getCompare();
    return ok(snapshots);
  }

  @Post('compare-analysis')
  async compareAnalysis(@Body() body: { source_ids: string[] }) {
    const result = await this.comparisonService.analyze(body.source_ids);
    return ok(result);
  }

  @Get('compare-history')
  async compareHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = parseInt(page || '1', 10);
    const l = parseInt(limit || '20', 10);
    const result = await this.comparisonService.getHistory(p, l);
    return paginated(result.data, result.total, p, l);
  }

  @Get('compare-analysis/:id')
  async compareAnalysisById(@Param('id') id: string) {
    const record = await this.comparisonService.findOne(id);
    return ok(record);
  }

  @Get('fold-summary')
  async foldSummary(@Query('source_ids') raw?: string) {
    const ids = (raw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const data = await this.snapshotsService.getFoldSummary(ids);
    return ok(data);
  }

  @Get('publish-velocity')
  async publishVelocity(
    @Query('source_ids') raw?: string,
    @Query('window_hours') windowHours?: string,
    @Query('limit') limit?: string,
  ) {
    const ids = (raw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const wh =
      windowHours !== undefined && windowHours !== ''
        ? parseFloat(windowHours)
        : undefined;
    const data = await this.snapshotsService.getPublishingVelocity(ids, {
      windowHours:
        wh !== undefined && Number.isFinite(wh) && wh > 0 ? wh : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return ok(data);
  }

  @Get('source-analytics')
  @Header('Cache-Control', 'no-store')
  async sourceAnalytics(
    @Query('source_ids') raw?: string,
    @Query('window_hours') windowHours?: string,
  ) {
    const ids = (raw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const wh =
      windowHours !== undefined && windowHours !== ''
        ? parseFloat(windowHours)
        : undefined;
    const windowArg =
      wh === undefined || !Number.isFinite(wh) || wh <= 0 ? null : wh;
    const data = await this.snapshotsService.getSourceAnalytics(ids, windowArg);
    return ok(data);
  }

  @Get('stories-in-window')
  @Header('Cache-Control', 'no-store')
  async storiesInWindow(
    @Query('source_ids') raw?: string,
    @Query('window_minutes') windowMinutes?: string,
  ) {
    const ids = (raw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const wm = parseInt(windowMinutes || '', 10);
    /** ~10 years in minutes — sanity cap */
    const MAX_WINDOW_MINUTES = 5_256_000;
    if (!Number.isFinite(wm) || wm <= 0 || wm > MAX_WINDOW_MINUTES) {
      throw new BadRequestException(
        'window_minutes must be a positive number (up to ~10 years)',
      );
    }
    const data = await this.snapshotsService.getStoriesInWindow(ids, wm);
    return ok(data);
  }

  @Get('overview-window-stats')
  @Header('Cache-Control', 'no-store')
  async overviewWindowStats(@Query('window_minutes') windowMinutes?: string) {
    const wm = parseInt(windowMinutes || '', 10);
    const MAX_WINDOW_MINUTES = 5_256_000;
    if (!Number.isFinite(wm) || wm <= 0 || wm > MAX_WINDOW_MINUTES) {
      throw new BadRequestException(
        'window_minutes must be a positive number (up to ~10 years)',
      );
    }
    const data = await this.snapshotsService.getOverviewWindowStats(wm);
    return ok(data);
  }

  @Get(':sourceId/history')
  async history(
    @Param('sourceId') sourceId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = parseInt(page || '1', 10);
    const l = parseInt(limit || '20', 10);
    const result = await this.snapshotsService.getHistory(sourceId, p, l);
    return paginated(result.data, result.total, p, l);
  }
}
