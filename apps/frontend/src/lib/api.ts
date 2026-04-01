function apiBase(): string {
  if (typeof window !== 'undefined') {
    return '';
  }
  return (
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3001'
  );
}

interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
  error?: {
    statusCode: number;
    message: string;
  };
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = `${apiBase()}/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    cache: 'no-store',
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error?.message || `Request failed: ${res.status}`);
  }

  return json;
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export interface Source {
  id: string;
  name: string;
  url: string;
  status: 'active' | 'paused' | 'error';
  crawl_interval_minutes: number;
  last_crawled_at: string | null;
  last_successful_at: string | null;
  failure_count: number;
  created_at: string;
  snapshots?: Snapshot[];
}

export type StoryItem = {
  title: string;
  url?: string;
  keywords?: string[];
  source_updated_at?: string;
  source_updated_source?: string;
  source_time_available?: boolean;
  first_seen_at?: string;
  is_new_since_last_crawl?: boolean;
};

export interface Snapshot {
  id: string;
  source_id: string;
  headline: string | null;
  summary: string | null;
  hero_image_url: string | null;
  published_at: string | null;
  modified_at: string | null;
  date_source: string | null;
  freshness_score: number | null;
  stories: StoryItem[] | null;
  new_stories?: StoryItem[] | null;
  video_urls: string[] | null;
  raw_meta: object | null;
  extraction_failed: boolean;
  created_at: string;
  source?: Source;
}

export interface FoldSummaryRow {
  source_id: string;
  source_name: string;
  story_count: number;
  new_count: number;
  sticky_over_24h: number;
  stories: StoryItem[];
}

export interface PublishingVelocitySourceMetrics {
  source_id: string;
  source_name: string;
  crawl_interval_minutes: number;
  series: { at: string; new_count: number }[];
  total_new_in_window: number;
  crawl_count_in_window: number;
  avg_new_per_crawl: number;
  estimated_new_per_hour: number;
}

export interface PublishingVelocityResponse {
  window_hours: number;
  limit: number;
  sources: PublishingVelocitySourceMetrics[];
  head_to_head?: {
    source_a_id: string;
    source_b_id: string;
    total_new_a: number;
    total_new_b: number;
    avg_new_per_crawl_a: number;
    avg_new_per_crawl_b: number;
    estimated_new_per_hour_a: number;
    estimated_new_per_hour_b: number;
    faster_by_estimated_hourly_rate: string | null;
  };
}

export interface CrawlNowResult {
  started: boolean;
  source_id: string;
  reason?: string;
}

export interface RunAllCrawlsResult {
  ok: boolean;
  reason?: 'scheduler_disabled';
  queued_count: number;
  skipped_in_flight_count: number;
  source_ids: string[];
}

export interface AgentRun {
  id: string;
  task_type: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  total_steps: number;
  total_tokens: number;
  final_summary: string | null;
  started_at: string;
  completed_at: string | null;
  steps?: AgentStep[];
}

export interface AgentStep {
  id: string;
  run_id: string;
  step_number: number;
  type: 'think' | 'tool_call' | 'tool_result' | 'final';
  tool_name: string | null;
  tool_input: object | null;
  tool_output: object | null;
  reasoning_text: string | null;
  tokens_used: number;
  created_at: string;
}

export interface ComparisonAnalysis {
  freshness_ranking: {
    source_name: string;
    source_id: string;
    modified_at: string | null;
    freshness_score: number | null;
    posted_first: boolean;
  }[];
  content_analysis: {
    source_name: string;
    source_id: string;
    readability: 'high' | 'medium' | 'low';
    detail_level: number;
    strengths: string[];
    weaknesses: string[];
  }[];
  keyword_analysis: {
    source_name: string;
    source_id: string;
    keywords: string[];
    unique_keywords: string[];
  }[];
  story_comparison: {
    source_name: string;
    source_id: string;
    story_count: number;
    top_stories: { title: string; keywords: string[] }[];
    common_stories: string[];
    exclusive_stories: string[];
  }[];
  matched_stories: {
    topic: string;
    covered_by: {
      source_name: string;
      source_id: string;
      title: string;
      filed_first: boolean;
    }[];
    differences: string[];
  }[];
  video_comparison: {
    source_name: string;
    source_id: string;
    video_count: number;
    video_urls: string[];
    has_video: boolean;
  }[];
  overall_verdict: string;
  best_for_reader: {
    source_name: string;
    source_id: string;
    reason: string;
  };
}

export interface ComparisonRecord {
  id: string;
  source_ids: string[];
  source_names: string[];
  created_at: string;
  analysis?: ComparisonAnalysis;
}

export interface CrawlStatus {
  scheduler_enabled: boolean;
  active_run: {
    id: string;
    task_type: string;
    started_at: string;
    total_steps: number;
  } | null;
  last_completed_run: {
    id: string;
    status: string;
    completed_at: string | null;
    final_summary: string | null;
  } | null;
}

export interface DashboardStats {
  total_sources: number;
  active_sources: number;
  avg_freshness_score: number;
  freshest_source: {
    name: string;
    score: number;
    modified_at: string;
  } | null;
  stalest_source: {
    name: string;
    score: number;
    modified_at: string;
  } | null;
  last_run_at: string | null;
  runs_today: number;
  ai_provider: string;
}

export interface SchedulerStatus {
  enabled: boolean;
}
