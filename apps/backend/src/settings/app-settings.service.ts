import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettings, APP_SETTINGS_ID } from './entities/app-settings.entity';

@Injectable()
export class AppSettingsService implements OnModuleInit {
  private readonly logger = new Logger(AppSettingsService.name);

  constructor(
    @InjectRepository(AppSettings)
    private readonly repo: Repository<AppSettings>,
  ) {}

  async onModuleInit() {
    const existing = await this.repo.findOne({ where: { id: APP_SETTINGS_ID } });
    if (!existing) {
      await this.repo.save(
        this.repo.create({
          id: APP_SETTINGS_ID,
          crawl_scheduler_enabled: true,
        }),
      );
      this.logger.log('Created default app_settings row');
    }
  }

  async isCrawlSchedulerEnabled(): Promise<boolean> {
    const row = await this.repo.findOne({ where: { id: APP_SETTINGS_ID } });
    return row?.crawl_scheduler_enabled ?? true;
  }

  async setCrawlSchedulerEnabled(enabled: boolean): Promise<AppSettings> {
    let row = await this.repo.findOne({ where: { id: APP_SETTINGS_ID } });
    if (!row) {
      row = this.repo.create({ id: APP_SETTINGS_ID, crawl_scheduler_enabled: enabled });
    } else {
      row.crawl_scheduler_enabled = enabled;
    }
    return this.repo.save(row);
  }
}
