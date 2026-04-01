import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Inject,
  Logger,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { SourcesService } from './sources.service';
import { CreateSourceDto } from './dto/create-source.dto';
import { UpdateCrawlIntervalDto } from './dto/update-crawl-interval.dto';
import { ok } from '../common/helpers/response.helper';
import { SchedulerService } from '../scheduler/scheduler.service';

@Controller('sources')
export class SourcesController implements OnModuleInit {
  private readonly logger = new Logger(SourcesController.name);

  constructor(
    private readonly sourcesService: SourcesService,
    @Inject(forwardRef(() => SchedulerService))
    private readonly schedulerService: SchedulerService,
  ) {}

  onModuleInit() {
    this.logger.log(
      'SourcesController initialized — GET /, POST /, DELETE /:id, PATCH /:id/pause, PATCH /:id/crawl-interval, POST /:id/crawl-now',
    );
  }

  @Get()
  async findAll() {
    const sources = await this.sourcesService.findAllWithLatestSnapshot();
    return ok(sources);
  }

  @Post()
  async create(@Body() dto: CreateSourceDto) {
    const source = await this.sourcesService.create(dto);
    return ok(source);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.sourcesService.remove(id);
    return ok({ deleted: true });
  }

  @Patch(':id/pause')
  async togglePause(@Param('id') id: string) {
    const source = await this.sourcesService.togglePause(id);
    return ok(source);
  }

  @Patch(':id/crawl-interval')
  async updateCrawlInterval(
    @Param('id') id: string,
    @Body() dto: UpdateCrawlIntervalDto,
  ) {
    const source = await this.sourcesService.updateCrawlInterval(
      id,
      dto.crawl_interval_minutes,
    );
    return ok(source);
  }

  @Post(':id/crawl-now')
  async crawlNow(@Param('id') id: string) {
    const source = await this.sourcesService.findOne(id);
    const result = await this.schedulerService.dispatchSingleCrawl(source.id);
    return ok(result);
  }
}
