import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Snapshot } from '../../snapshots/entities/snapshot.entity';

@Entity('sources')
export class Source {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column()
  url!: string;

  @Column('varchar', { length: 32, default: 'active' })
  status!: 'active' | 'paused' | 'error';

  @Column({ default: 30 })
  crawl_interval_minutes!: number;

  @Column({ type: 'timestamp', nullable: true })
  last_crawled_at!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_successful_at!: Date | null;

  @Column({ default: 0 })
  failure_count!: number;

  @CreateDateColumn()
  created_at!: Date;

  @OneToMany(() => Snapshot, (s) => s.source)
  snapshots!: Snapshot[];
}
