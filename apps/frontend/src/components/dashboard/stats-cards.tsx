'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, Activity, Zap, Bot } from 'lucide-react';
import { freshnessColor, timeAgo } from '@/lib/format';
import type { DashboardStats } from '@/lib/api';

export function StatsCards({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Sources</CardTitle>
          <Globe className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total_sources}</div>
          <p className="text-xs text-muted-foreground">
            {stats.active_sources} active,{' '}
            {stats.total_sources - stats.active_sources} paused
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            Avg Freshness Score
          </CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div
            className={`text-2xl font-bold ${freshnessColor(stats.avg_freshness_score)}`}
          >
            {stats.avg_freshness_score.toFixed(4)}
          </div>
          <p className="text-xs text-muted-foreground">
            Scale 0–1, higher is fresher
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Freshest Source</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold truncate">
            {stats.freshest_source?.name || '—'}
          </div>
          <p className="text-xs text-muted-foreground">
            {stats.freshest_source
              ? timeAgo(stats.freshest_source.modified_at)
              : 'No data'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Runs Today</CardTitle>
          <Bot className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.runs_today}</div>
          <p className="text-xs text-muted-foreground">
            Last run: {timeAgo(stats.last_run_at)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
