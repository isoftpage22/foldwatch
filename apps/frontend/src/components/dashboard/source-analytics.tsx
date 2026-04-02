'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import type {
  Snapshot,
  SourceAnalyticsResponse,
  SourceAnalyticsSourceMetrics,
} from '@/lib/api';

const CHART_COLORS = [
  '#16a34a',
  '#2563eb',
  '#d97706',
  '#9333ea',
  '#dc2626',
  '#0891b2',
];

type WindowKey = '24h' | '7d' | '30d' | 'all';

const WINDOW_HOURS: Record<WindowKey, number | null> = {
  '24h': 24,
  '7d': 168,
  '30d': 720,
  all: null,
};

function mergeChurnRows(sources: SourceAnalyticsSourceMetrics[]) {
  const times = [
    ...new Set(sources.flatMap((s) => s.churn_series.map((p) => p.at))),
  ].sort();
  return times.map((t) => {
    const row: Record<string, string | number | null> = { t };
    for (const s of sources) {
      const p = s.churn_series.find((x) => x.at === t);
      row[s.source_id] = p ? p.new_count + p.removed_count : null;
    }
    return row;
  });
}

function mergeFreshnessRows(sources: SourceAnalyticsSourceMetrics[]) {
  const times = [
    ...new Set(sources.flatMap((s) => s.freshness_series.map((p) => p.at))),
  ].sort();
  return times.map((t) => {
    const row: Record<string, string | number | null> = { t };
    for (const s of sources) {
      const p = s.freshness_series.find((x) => x.at === t);
      row[s.source_id] = p != null ? p.score : null;
    }
    return row;
  });
}

function tenureBarColor(minutes: number, maxMinutes: number): string {
  if (maxMinutes <= 0 || !Number.isFinite(maxMinutes)) return '#9ca3af';
  const r = Math.min(minutes / maxMinutes, 1);
  if (r < 0.33) return '#16a34a';
  if (r < 0.66) return '#d97706';
  return '#dc2626';
}

export function SourceAnalytics({ snapshots }: { snapshots: Snapshot[] }) {
  const [windowKey, setWindowKey] = useState<WindowKey>('7d');
  const [data, setData] = useState<SourceAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceIds = useMemo(
    () => snapshots.map((s) => s.source_id).filter(Boolean),
    [snapshots],
  );

  const load = useCallback(async () => {
    if (sourceIds.length === 0) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const wh = WINDOW_HOURS[windowKey];
      const q =
        wh == null
          ? `source_ids=${encodeURIComponent(sourceIds.join(','))}`
          : `source_ids=${encodeURIComponent(sourceIds.join(','))}&window_hours=${wh}`;
      const res = await api.get<SourceAnalyticsResponse>(
        `/snapshots/source-analytics?${q}`,
      );
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [sourceIds, windowKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const sources = data?.sources ?? [];
  const maxTenure = Math.max(
    0,
    ...sources.map((s) => s.avg_tenure_minutes),
  );

  const tenureChartData = useMemo(
    () =>
      sources.map((s) => ({
        name: s.source_name,
        minutes: s.avg_tenure_minutes,
        label: s.tenure_label,
        tracked: s.total_stories_tracked,
      })),
    [sources],
  );

  const churnMerged = useMemo(() => mergeChurnRows(sources), [sources]);
  const freshMerged = useMemo(() => mergeFreshnessRows(sources), [sources]);

  const updatesLeader = useMemo(() => {
    if (sources.length === 0) return null;
    const sorted = [...sources].sort(
      (a, b) => b.fold_updates_per_day - a.fold_updates_per_day,
    );
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    const ratio =
      bottom.fold_updates_per_day > 0
        ? top.fold_updates_per_day / bottom.fold_updates_per_day
        : null;
    return { top, bottom, ratio };
  }, [sources]);

  if (sourceIds.length === 0) {
    return null;
  }

  return (
    <Card className="border-muted">
      <CardHeader className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Source behavior analytics</CardTitle>
            <p className="text-sm text-muted-foreground font-normal mt-1">
              Story tenure on fold, churn between crawls, and freshness over
              time — per source.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {(['24h', '7d', '30d', 'all'] as const).map((k) => (
              <Button
                key={k}
                type="button"
                variant={windowKey === k ? 'default' : 'outline'}
                size="sm"
                className="h-8"
                onClick={() => setWindowKey(k)}
              >
                {k === 'all' ? 'All' : k}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-10">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading analytics…
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {!loading && !error && sources.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No analytics data yet for the selected window.
          </p>
        )}
        {!loading && sources.length > 0 && (
          <>
            {/* 1 — Tenure */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">
                1. Avg. time stories stay on first fold
              </h3>
              <p className="text-xs text-muted-foreground">
                From story presence (first seen → last seen). Shorter often
                means a more volatile fold.
              </p>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={tenureChartData}
                    layout="vertical"
                    margin={{ left: 8, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => `${Math.round(v)}m`}
                      label={{ value: 'Minutes', position: 'insideBottom', offset: -4 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value) => [
                        `${Number(value ?? 0).toFixed(1)} min avg`,
                        'Tenure',
                      ]}
                      labelFormatter={(_, payload) =>
                        (payload?.[0]?.payload as { label?: string })?.label ??
                        ''
                      }
                    />
                    <Bar dataKey="minutes" radius={[0, 4, 4, 0]} name="Avg tenure">
                      {tenureChartData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={tenureBarColor(entry.minutes, maxTenure)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sources.map((s) => (
                  <div
                    key={s.source_id}
                    className="rounded-lg border bg-muted/30 px-3 py-2 text-xs"
                  >
                    <span className="font-medium">{s.source_name}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      — {s.tenure_label} ({s.total_stories_tracked} stories)
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* 2 — Churn */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">
                2. Fold churn (new + removed stories per crawl)
              </h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={churnMerged} margin={{ left: 4, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) =>
                        new Date(v).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      }
                    />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(v) => new Date(String(v)).toLocaleString()}
                    />
                    <Legend />
                    {sources.map((s, i) => (
                      <Line
                        key={s.source_id}
                        type="monotone"
                        dataKey={s.source_id}
                        name={s.source_name}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        dot={false}
                        strokeWidth={2}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                {sources.map((s) => (
                  <div
                    key={s.source_id}
                    className="rounded-lg border px-3 py-2 space-y-0.5"
                  >
                    <p className="font-medium">{s.source_name}</p>
                    <p className="text-muted-foreground">
                      Avg new/crawl: {s.avg_new_per_crawl} · removed/crawl:{' '}
                      {s.avg_removed_per_crawl} · churn rate:{' '}
                      {s.churn_rate.toFixed(3)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* 3 — Freshness */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">
                3. Freshness score over time
              </h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={freshMerged} margin={{ left: 4, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="t"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) =>
                        new Date(v).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      }
                    />
                    <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                    <Tooltip
                      labelFormatter={(v) => new Date(String(v)).toLocaleString()}
                      formatter={(v) => [
                        v != null && typeof v === 'number'
                          ? v.toFixed(4)
                          : '—',
                        'Freshness',
                      ]}
                    />
                    <Legend />
                    {sources.map((s, i) => (
                      <Line
                        key={s.source_id}
                        type="monotone"
                        dataKey={s.source_id}
                        name={s.source_name}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        dot={false}
                        strokeWidth={2}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                {sources.map((s) => (
                  <div
                    key={s.source_id}
                    className="rounded-lg border px-3 py-2 space-y-0.5"
                  >
                    <p className="font-medium">{s.source_name}</p>
                    <p className="text-muted-foreground">
                      Avg freshness: {s.avg_freshness.toFixed(4)} · Crawls in
                      window: {s.update_count} · ~{s.fold_updates_per_day.toFixed(1)}{' '}
                      fold updates/day
                    </p>
                  </div>
                ))}
              </div>
              {updatesLeader && updatesLeader.ratio != null && updatesLeader.ratio > 1.05 && (
                <p className="text-sm rounded-md border bg-muted/40 px-3 py-2">
                  <span className="font-medium">{updatesLeader.top.source_name}</span>{' '}
                  shows ~{updatesLeader.ratio.toFixed(1)}× more snapshot updates
                  per day than{' '}
                  <span className="font-medium">
                    {updatesLeader.bottom.source_name}
                  </span>{' '}
                  in this window (by fold_updates_per_day).
                </p>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
