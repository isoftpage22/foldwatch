'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { PerSourceFreshnessCards } from '@/components/dashboard/per-source-freshness-cards';
import { RecencyChart } from '@/components/dashboard/recency-chart';
import { SourceAnalytics } from '@/components/dashboard/source-analytics';
import { AgentRunTimeline } from '@/components/dashboard/agent-run-timeline';
import { api } from '@/lib/api';
import type {
  DashboardStats,
  Snapshot,
  AgentRun,
  OverviewWindowSourceRow,
  OverviewWindowStatsResponse,
} from '@/lib/api';
import { useTimeRange } from '@/context/time-range-context';

export default function OverviewPage() {
  const { minutes, label: timeRangeLabel } = useTimeRange();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowRows, setWindowRows] = useState<OverviewWindowSourceRow[]>([]);
  const [windowLoading, setWindowLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, compareRes, runsRes] = await Promise.all([
          api.get<DashboardStats>('/dashboard/stats'),
          api.get<Snapshot[]>('/snapshots/compare'),
          api.get<AgentRun[]>('/runs'),
        ]);
        setStats(statsRes.data);
        setSnapshots(compareRes.data);
        setRuns(Array.isArray(runsRes.data) ? runsRes.data : []);
      } catch {
        // Data will remain empty
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (snapshots.length === 0) {
      setWindowRows([]);
      return;
    }
    let cancelled = false;
    setWindowLoading(true);
    api
      .get<OverviewWindowStatsResponse>(
        `/snapshots/overview-window-stats?window_minutes=${minutes}`,
      )
      .then((res) => {
        if (!cancelled) setWindowRows(res.data.sources);
      })
      .catch(() => {
        if (!cancelled) setWindowRows([]);
      })
      .finally(() => {
        if (!cancelled) setWindowLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [minutes, snapshots]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[340px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">
          Fold activity and new stories in the selected window — DB-backed.
        </p>
      </div>

      {stats && <StatsCards stats={stats} />}

      {stats && snapshots.length > 0 && (
        <div className="space-y-2">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">
              New stories on fold by source
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Primary number = total new stories in the window (sum of snapshot{' '}
              <span className="font-medium text-foreground">new_stories</span>
              ). Same rolling window as the header (
              <span className="font-medium text-foreground">{timeRangeLabel}</span>
              ). Below: page recency score from the latest crawl.
            </p>
          </div>
          <PerSourceFreshnessCards
            snapshots={snapshots}
            stats={stats}
            windowRows={windowRows}
            timeRangeLabel={timeRangeLabel}
            windowLoading={windowLoading}
          />
        </div>
      )}

      {/* <Card>
        <CardHeader>
          <CardTitle>Freshness score (latest crawl)</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            Recency score from page <span className="font-medium">modified_at</span>, not
            the window total above.
          </p>
        </CardHeader>
        <CardContent>
          {snapshots.length > 0 ? (
            <RecencyChart snapshots={snapshots} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No snapshot data yet. Add sources and run the agent.
            </p>
          )}
        </CardContent>
      </Card> */}

      <SourceAnalytics snapshots={snapshots} />

      <Card>
        <CardHeader>
          <CardTitle>Recent Agent Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentRunTimeline runs={runs} />
        </CardContent>
      </Card>
    </div>
  );
}
