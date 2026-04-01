import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('comparison_results')
export class ComparisonResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('json')
  source_ids!: string[];

  @Column('json')
  source_names!: string[];

  @Column('json')
  analysis!: object;

  @CreateDateColumn()
  created_at!: Date;
}
