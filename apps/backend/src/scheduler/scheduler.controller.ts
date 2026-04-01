import {
  Controller,
  Get,
  Post,
  Patch,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ok } from '../common/helpers/response.helper';

@Controller('scheduler')
export class SchedulerController implements OnModuleInit {
  private readonly logger = new Logger(SchedulerController.name);

  constructor(private readonly schedulerService: SchedulerService) {}

  onModuleInit() {
    this.logger.log(
      'SchedulerController initialized — GET /status, PATCH /toggle, POST /stop-crawl, POST /run-all-now',
    );
  }

  @Get('status')
  async getStatus() {
    const enabled = await this.schedulerService.isEnabled();
    return ok({ enabled });
  }

  @Patch('toggle')
  async toggle() {
    const current = await this.schedulerService.isEnabled();
    const newValue = await this.schedulerService.setEnabled(!current);
    return ok({ enabled: newValue });
  }

  @Post('stop-crawl')
  async stopCrawl() {
    const result = await this.schedulerService.stopCrawl();
    return ok(result);
  }

  /** Crawl all active sources now, in parallel (bounded by CRAWL_CONCURRENCY). */
  @Post('run-all-now')
  async runAllNow() {
    const result = await this.schedulerService.dispatchCrawlAllActive();
    return ok(result);
  }
}
