import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Singleton row id for global app settings. */
export const APP_SETTINGS_ID = 'default';

@Entity('app_settings')
export class AppSettings {
  @PrimaryColumn({ length: 36, default: APP_SETTINGS_ID })
  id!: string;

  @Column({ default: true })
  crawl_scheduler_enabled!: boolean;

  @UpdateDateColumn()
  updated_at!: Date;
}
