import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('story_fold_presence')
@Unique(['source_id', 'story_key'])
@Index(['source_id'])
export class StoryFoldPresence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  source_id!: string;

  /**
   * SHA-256 hex of canonical story key (see SnapshotsService.storyKey).
   * Stored as a digest so UNIQUE(source_id, story_key) stays under MySQL's
   * 3072-byte index limit (long URLs × utf8mb4 would exceed it).
   */
  @Column({ length: 64 })
  story_key!: string;

  @Column({ type: 'timestamp' })
  first_seen_at!: Date;

  @Column({ type: 'timestamp' })
  last_seen_at!: Date;

  @CreateDateColumn()
  created_at!: Date;
}
