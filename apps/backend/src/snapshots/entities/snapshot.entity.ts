import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Source } from '../../sources/entities/source.entity';

@Entity('snapshots')
export class Snapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Source, (s) => s.snapshots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_id' })
  source!: Source;

  @Column({ name: 'source_id' })
  source_id!: string;

  @Column('text', { nullable: true })
  headline!: string | null;

  @Column('text', { nullable: true })
  summary!: string | null;

  @Column('varchar', { length: 2048, nullable: true })
  hero_image_url!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  published_at!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  modified_at!: Date | null;

  @Column('varchar', { length: 255, nullable: true })
  date_source!: string | null;

  @Column('float', { nullable: true })
  freshness_score!: number | null;

  @Column('json', { nullable: true })
  stories!:
    | {
        title: string;
        url?: string;
        keywords?: string[];
        source_updated_at?: string;
        source_updated_source?: string;
        source_time_available?: boolean;
      }[]
    | null;

  /** Stories that were not present in the previous snapshot for this source (same shape as stories). */
  @Column('json', { nullable: true })
  new_stories!:
    | {
        title: string;
        url?: string;
        keywords?: string[];
        source_updated_at?: string;
        source_updated_source?: string;
        source_time_available?: boolean;
      }[]
    | null;

  @Column('json', { nullable: true })
  video_urls!: string[] | null;

  @Column('json', { nullable: true })
  raw_meta!: object | null;

  @Column({ default: false })
  extraction_failed!: boolean;

  @CreateDateColumn()
  created_at!: Date;
}
