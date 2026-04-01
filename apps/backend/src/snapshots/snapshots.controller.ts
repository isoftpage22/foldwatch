import {
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
    const data = await this.snapshotsService.getPublishingVelocity(ids, {
      windowHours: windowHours ? parseInt(windowHours, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
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
