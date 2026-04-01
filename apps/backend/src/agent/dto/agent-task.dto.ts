export interface AgentTaskDto {
  task_type: 'crawl_sources' | 'self_heal' | 'discover';
  source_ids?: string[];
}
