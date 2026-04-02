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
import type { DashboardStats, Snapshot, AgentRun } from '@/lib/api';

export default function OverviewPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);

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
          Web intelligence dashboard — freshness at a glance.
        </p>
      </div>

      {stats && <StatsCards stats={stats} />}

      {stats && snapshots.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Freshness by source
          </h2>
          <PerSourceFreshnessCards snapshots={snapshots} stats={stats} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Source Freshness</CardTitle>
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
      </Card>

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
