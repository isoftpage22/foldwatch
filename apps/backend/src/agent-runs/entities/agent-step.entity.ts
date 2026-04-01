import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AgentRun } from './agent-run.entity';

@Entity('agent_steps')
export class AgentStep {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => AgentRun, (r) => r.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run!: AgentRun;

  @Column({ name: 'run_id' })
  run_id!: string;

  @Column()
  step_number!: number;

  @Column('varchar', { length: 32 })
  type!: 'think' | 'tool_call' | 'tool_result' | 'final';

  @Column('varchar', { length: 128, nullable: true })
  tool_name!: string | null;

  @Column('json', { nullable: true })
  tool_input!: object | null;

  @Column('json', { nullable: true })
  tool_output!: object | null;

  @Column('text', { nullable: true })
  reasoning_text!: string | null;

  @Column({ default: 0 })
  tokens_used!: number;

  @CreateDateColumn()
  created_at!: Date;
}
