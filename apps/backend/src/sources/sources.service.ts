import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Source } from './entities/source.entity';
import { CreateSourceDto } from './dto/create-source.dto';
import { SnapshotsService } from '../snapshots/snapshots.service';

const ALLOWED_INTERVALS = new Set([5, 15, 30]);

@Injectable()
export class SourcesService implements OnModuleInit {
  private readonly logger = new Logger(SourcesService.name);

  constructor(
    @InjectRepository(Source)
    private readonly repo: Repository<Source>,
    private readonly config: ConfigService,
    private readonly snapshotsService: SnapshotsService,
  ) {}

  onModuleInit() {
    this.logger.log('SourcesService initialized');
  }

  async findAll(): Promise<Source[]> {
    return this.repo.find({
      order: { created_at: 'DESC' },
    });
  }

  async findAllWithLatestSnapshot(): Promise<Source[]> {
    const sources = await this.repo
      .createQueryBuilder('source')
      .leftJoinAndSelect('source.snapshots', 'snapshot')
      .orderBy('source.created_at', 'DESC')
      .addOrderBy('snapshot.created_at', 'DESC')
      .getMany();

    return Promise.all(
      sources.map(async (s) => {
        if (!s.snapshots?.length) return s;
        const sorted = [...s.snapshots].sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        );
        const latest = sorted[0];
        const enriched = await this.snapshotsService.attachTenureToSnapshot(
          latest,
        );
        return Object.assign(s, {
          snapshots: [enriched, ...sorted.slice(1)],
        });
      }),
    );
  }

  async findActive(): Promise<Source[]> {
    return this.repo.find({ where: { status: 'active' } });
  }

  async findOne(id: string): Promise<Source> {
    const source = await this.repo.findOne({ where: { id } });
    if (!source) throw new NotFoundException(`Source ${id} not found`);
    return source;
  }

  async create(dto: CreateSourceDto): Promise<Source> {
    const defaultMin =
      this.config.get<number>('app.defaultCrawlIntervalMinutes') ?? 30;
    const raw = dto.crawl_interval_minutes ?? defaultMin;
    const crawl_interval_minutes = ALLOWED_INTERVALS.has(raw) ? raw : 30;
    const source = this.repo.create({
      ...dto,
      crawl_interval_minutes,
    });
    return this.repo.save(source);
  }

  async updateCrawlInterval(id: string, minutes: number): Promise<Source> {
    if (!ALLOWED_INTERVALS.has(minutes)) {
      throw new BadRequestException(
        'crawl_interval_minutes must be 5, 15, or 30',
      );
    }
    const source = await this.findOne(id);
    source.crawl_interval_minutes = minutes;
    return this.repo.save(source);
  }

  async remove(id: string): Promise<void> {
    const source = await this.findOne(id);
    await this.repo.remove(source);
  }

  async togglePause(id: string): Promise<Source> {
    const source = await this.findOne(id);
    source.status = source.status === 'paused' ? 'active' : 'paused';
    return this.repo.save(source);
  }

  async incrementFailure(id: string): Promise<Source> {
    const source = await this.findOne(id);
    source.failure_count += 1;
    if (source.failure_count > 3) {
      source.status = 'error';
    }
    return this.repo.save(source);
  }

  async markCrawled(id: string, success: boolean): Promise<Source> {
    const source = await this.findOne(id);
    source.last_crawled_at = new Date();
    if (success) {
      source.last_successful_at = new Date();
      source.failure_count = 0;
    }
    return this.repo.save(source);
  }

  async getStats() {
    const total = await this.repo.count();
    const active = await this.repo.count({ where: { status: 'active' } });
    return { total_sources: total, active_sources: active };
  }
}
