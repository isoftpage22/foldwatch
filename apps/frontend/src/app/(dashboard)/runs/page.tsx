'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, estimateCost, providerLabel } from '@/lib/format';
import type {
  AgentRun,
  AgentStep,
  DashboardStats,
  CrawlStatus,
} from '@/lib/api';

const statusClass: Record<string, string> = {
  running: 'bg-blue-100 text-blue-800 animate-pulse',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  aborted: 'bg-gray-100 text-gray-800',
};

const stepTypeClass: Record<string, string> = {
  think: 'border-l-gray-400 bg-gray-50',
  tool_call: 'border-l-blue-400 bg-blue-50',
  tool_result: 'border-l-teal-400 bg-teal-50',
  final: 'border-l-purple-400 bg-purple-50',
};

function StepCard({
  step,
  eventIndex,
  eventTotal,
}: {
  step: AgentStep;
  eventIndex: number;
  eventTotal: number;
}) {
  return (
    <div
      className={`border-l-4 rounded-r-lg p-3 text-sm ${stepTypeClass[step.type] || 'bg-muted'}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline" className="text-xs">
          {step.type}
        </Badge>
        {step.tool_name && (
          <Badge variant="secondary" className="text-xs">
            {step.tool_name}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground ml-auto text-right shrink-0">
          #{eventIndex + 1}/{eventTotal}
          <span className="text-muted-foreground/80"> · turn </span>
          {step.step_number}
          {step.tokens_used > 0 && ` · ${step.tokens_used} tokens`}
        </span>
      </div>

      {step.type === 'think' && step.reasoning_text && (
        <pre className="font-mono text-xs whitespace-pre-wrap mt-1 max-h-40 overflow-auto">
          {step.reasoning_text}
        </pre>
      )}

      {step.type === 'tool_call' && step.tool_input && (
        <pre className="font-mono text-xs whitespace-pre-wrap mt-1 max-h-40 overflow-auto">
          {JSON.stringify(step.tool_input, null, 2)}
        </pre>
      )}

      {step.type === 'tool_result' && step.tool_output && (
        <div>
          {(step.tool_output as Record<string, unknown>).success === false && (
            <Badge variant="destructive" className="text-xs mb-1">
              Error
            </Badge>
          )}
          {(step.tool_output as Record<string, unknown>).success === true && (
            <Badge
              variant="secondary"
              className="text-xs mb-1 bg-green-100 text-green-800"
            >
              Success
            </Badge>
          )}
          <pre className="font-mono text-xs whitespace-pre-wrap mt-1 max-h-40 overflow-auto">
            {JSON.stringify(step.tool_output, null, 2)}
          </pre>
        </div>
      )}

      {step.type === 'final' && step.reasoning_text && (
        <p className="mt-1">{step.reasoning_text}</p>
      )}
    </div>
  );
}

function RunItem({
  run: initialRun,
  aiProvider,
}: {
  run: AgentRun;
  aiProvider: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [run, setRun] = useState(initialRun);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSteps = useCallback(async () => {
    setLoadingSteps(true);
    try {
      const res = await api.get<AgentStep[]>(
        `/runs/${run.id}/steps?limit=500`,
      );
      setSteps(Array.isArray(res.data) ? res.data : []);
    } catch {
      // empty
    } finally {
      setLoadingSteps(false);
    }
  }, [run.id]);

  useEffect(() => {
    if (expanded) {
      loadSteps();
    }
  }, [expanded, loadSteps]);

  useEffect(() => {
    if (expanded && run.status === 'running') {
      pollRef.current = setInterval(async () => {
        try {
          const [runRes, stepsRes] = await Promise.all([
            api.get<AgentRun>(`/runs/${run.id}`),
            api.get<AgentStep[]>(`/runs/${run.id}/steps?limit=500`),
          ]);
          setRun(runRes.data);
          setSteps(Array.isArray(stepsRes.data) ? stepsRes.data : []);
          if (runRes.data.status !== 'running') {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          // silent
        }
      }, 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [expanded, run.status, run.id]);

  const duration = run.completed_at
    ? `${Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`
    : 'In progress';

  return (
    <Card>
      <button
        className="w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <CardHeader className="flex flex-row items-center gap-3 py-4">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{run.task_type}</span>
              <Badge variant="secondary" className={statusClass[run.status]}>
                {run.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDate(run.started_at)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {run.total_steps} trace events · {run.total_tokens.toLocaleString()}{' '}
              tokens · {estimateCost(run.total_tokens, aiProvider)} · {duration}
            </div>
          </div>
        </CardHeader>
      </button>

      {expanded && (
        <CardContent className="pt-0">
          <Separator className="mb-4" />

          {run.final_summary && (
            <div className="mb-4 p-3 bg-muted rounded-lg text-sm">
              <strong>Summary:</strong> {run.final_summary}
            </div>
          )}

          {loadingSteps ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 rounded" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                The header count is how many rows were saved (each tool call,
                tool result, model text, etc.). The turn number is the agent loop
                index—several events often share the same turn.
              </p>
              {steps.length > 0 && steps.length !== run.total_steps && (
                <p className="text-xs text-amber-800 dark:text-amber-200 mb-1">
                  Showing {steps.length} rows but this run has {run.total_steps}{' '}
                  recorded—refresh or check the API if the list looks incomplete.
                </p>
              )}
              {steps.map((step, i) => (
                <StepCard
                  key={step.id}
                  step={step}
                  eventIndex={i}
                  eventTotal={Math.max(steps.length, run.total_steps)}
                />
              ))}
              {steps.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No steps recorded yet.
                </p>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function CrawlInProgressBanner({
  schedulerEnabled,
}: {
  schedulerEnabled: boolean | undefined;
}) {
  return (
    <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40">
      <CardContent className="flex items-center gap-3 py-4">
        <Loader2 className="h-5 w-5 text-blue-600 animate-spin flex-shrink-0" />
        <div>
          <p className="font-medium text-blue-900 dark:text-blue-100 text-sm">
            Agent run in progress
          </p>
          <p className="text-xs text-blue-800 dark:text-blue-200">
            The LLM agent is still marked running for this crawl. This page
            polls until it finishes.
          </p>
          {schedulerEnabled === false && (
            <p className="text-xs text-amber-800 dark:text-amber-200 mt-1.5">
              Auto-crawl is off — only this in-flight run is active (e.g. started
              before you paused, or triggered manually).
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CrawlStatusBar({ status }: { status: CrawlStatus }) {
  if (!status.active_run) {
    return null;
  }
  const { active_run } = status;
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground bg-muted/50 rounded-lg px-4 py-2">
      <span>
        Agent run <strong>        {active_run.task_type}</strong> &middot;{' '}
        {active_run.total_steps} trace event(s)
      </span>
      {!status.scheduler_enabled && (
        <span className="text-amber-700">
          Auto-crawl is off (scheduler disabled)
        </span>
      )}
    </div>
  );
}

export default function RunsPage() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [aiProvider, setAiProvider] = useState('gemini');
  const [loading, setLoading] = useState(true);
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [runsRes, statsRes, statusRes] = await Promise.all([
        api.get<AgentRun[]>('/runs'),
        api.get<DashboardStats>('/dashboard/stats'),
        api.get<CrawlStatus>('/dashboard/crawl-status'),
      ]);
      setRuns(Array.isArray(runsRes.data) ? runsRes.data : []);
      if (statsRes.data?.ai_provider) {
        setAiProvider(statsRes.data.ai_provider);
      }
      setCrawlStatus(statusRes.data);
    } catch {
      // empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isCrawling = Boolean(crawlStatus?.active_run);

  useEffect(() => {
    if (isCrawling) {
      pollRef.current = setInterval(loadData, 5000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isCrawling, loadData]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent Runs</h1>
        <p className="text-muted-foreground">
          Full trace of every AI agent execution.{' '}
          <Badge variant="outline" className="ml-1 text-xs">
            {providerLabel(aiProvider)}
          </Badge>
        </p>
      </div>

      {crawlStatus && <CrawlStatusBar status={crawlStatus} />}
      {isCrawling && (
        <CrawlInProgressBanner
          schedulerEnabled={crawlStatus?.scheduler_enabled}
        />
      )}

      {runs.length === 0 && !isCrawling ? (
        <div className="text-center py-12 text-muted-foreground">
          No agent runs yet. Add sources and trigger a crawl.
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <RunItem key={run.id} run={run} aiProvider={aiProvider} />
          ))}
        </div>
      )}
    </div>
  );
}
