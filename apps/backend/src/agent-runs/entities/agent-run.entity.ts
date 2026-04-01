import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { AgentStep } from './agent-step.entity';

@Entity('agent_runs')
export class AgentRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  task_type!: string;

  @Column('varchar', { length: 32, default: 'running' })
  status!: 'running' | 'completed' | 'failed' | 'aborted';

  @Column({ default: 0 })
  total_steps!: number;

  @Column({ default: 0 })
  total_tokens!: number;

  @Column('text', { nullable: true })
  final_summary!: string | null;

  @CreateDateColumn()
  started_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at!: Date | null;

  @OneToMany(() => AgentStep, (s) => s.run)
  steps!: AgentStep[];
}
