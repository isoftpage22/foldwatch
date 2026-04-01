export interface AgentResultDto {
  run_id: string;
  status: 'completed' | 'failed' | 'aborted';
  total_steps: number;
  total_tokens: number;
  final_summary: string | null;
  started_at: Date;
  completed_at: Date | null;
}
