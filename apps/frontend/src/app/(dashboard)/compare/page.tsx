'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FoldCard } from '@/components/compare/fold-card';
import { CompareSourcesDetail } from '@/components/compare/compare-sources-detail';
import { AnalysisPanel } from '@/components/compare/analysis-panel';
import { api } from '@/lib/api';
import type {
  Snapshot,
  PublishingVelocityResponse,
  ComparisonRecord,
  ComparisonAnalysis,
} from '@/lib/api';
import { Loader2, History, Eye, RefreshCw } from 'lucide-react';

type SortKey = 'freshness' | 'name' | 'modified';
const MAX_SELECTION = 3;

export default function ComparePage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('freshness');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [velocity24, setVelocity24] = useState<PublishingVelocityResponse | null>(
    null,
  );
  const [velocityLoading, setVelocityLoading] = useState(false);
  const [history, setHistory] = useState<ComparisonRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null);
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ComparisonAnalysis | null>(null);
  const [compareRefreshing, setCompareRefreshing] = useState(false);

  const fetchCompareSnapshots = useCallback(async () => {
    const res = await api.get<Snapshot[]>(
      `/snapshots/compare?_=${Date.now()}`,
    );
    return res.data;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run(showSkeleton: boolean) {
      if (showSkeleton) setLoading(true);
      try {
        const data = await fetchCompareSnapshots();
        if (!cancelled) setSnapshots(data);
      } catch {
        // empty
      } finally {
        if (!cancelled && showSkeleton) setLoading(false);
      }
    }

    run(true);

    const interval = setInterval(() => run(false), 30_000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') run(false);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchCompareSnapshots]);

  async function handleRefreshCompare() {
    setCompareRefreshing(true);
    try {
      const data = await fetchCompareSnapshots();
      setSnapshots(data);
    } catch {
      // empty
    } finally {
      setCompareRefreshing(false);
    }
  }

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await api.get<ComparisonRecord[]>('/snapshots/compare-history');
        setHistory(Array.isArray(res.data) ? res.data : []);
      } catch {
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    }
    loadHistory();
  }, []);

  useEffect(() => {
    if (selected.size < 2) {
      setVelocity24(null);
      return;
    }
    const ids = Array.from(selected).join(',');
    let cancelled = false;
    setVelocityLoading(true);
    api
      .get<PublishingVelocityResponse>(
        `/snapshots/publish-velocity?source_ids=${encodeURIComponent(ids)}&window_hours=24`,
      )
      .then((res) => {
        if (!cancelled) setVelocity24(res.data);
      })
      .catch(() => {
        if (!cancelled) setVelocity24(null);
      })
      .finally(() => {
        if (!cancelled) setVelocityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const toggleSource = (sourceId: string) => {
    setAnalysis(null);
    setViewingHistoryId(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else if (next.size < MAX_SELECTION) {
        next.add(sourceId);
      }
      return next;
    });
  };

  async function handleViewHistory(id: string) {
    setLoadingHistoryId(id);
    try {
      const res = await api.get<ComparisonRecord>(
        `/snapshots/compare-analysis/${id}`,
      );
      const rec = res.data;
      if (rec?.analysis && typeof rec.analysis === 'object') {
        setAnalysis(rec.analysis as ComparisonAnalysis);
        setViewingHistoryId(id);
      }
    } catch {
      // keep prior state
    } finally {
      setLoadingHistoryId(null);
    }
  }

  const sorted = [...snapshots]
    .filter(
      (s) =>
        !filter ||
        s.source?.name?.toLowerCase().includes(filter.toLowerCase()) ||
        s.headline?.toLowerCase().includes(filter.toLowerCase()),
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'freshness':
          return (b.freshness_score || 0) - (a.freshness_score || 0);
        case 'name':
          return (a.source?.name || '').localeCompare(b.source?.name || '');
        case 'modified':
          return (
            new Date(b.modified_at || 0).getTime() -
            new Date(a.modified_at || 0).getTime()
          );
        default:
          return 0;
      }
    });

  const selectedSnapshots = sorted.filter((s) => selected.has(s.source_id));

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-[350px] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compare</h1>
        <p className="text-muted-foreground">
          Select 2–3 sources to see new fold stories, how long each headline has
          been on the fold, and which site is changing the fold more often.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(['freshness', 'name', 'modified'] as SortKey[]).map((key) => (
            <Button
              key={key}
              size="sm"
              variant={sortBy === key ? 'default' : 'outline'}
              onClick={() => setSortBy(key)}
            >
              {key === 'freshness'
                ? 'By Freshness'
                : key === 'name'
                  ? 'By Name'
                  : 'By Modified'}
            </Button>
          ))}
        </div>
        <Input
          placeholder="Filter sources..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={compareRefreshing}
          onClick={() => void handleRefreshCompare()}
          className="gap-1.5"
        >
          {compareRefreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh data
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">
          {selected.size}/{MAX_SELECTION} selected
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No snapshots to compare. Add sources and run the agent.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((snapshot) => (
            <FoldCard
              key={snapshot.id}
              snapshot={snapshot}
              selectable
              compactPicker
              selected={selected.has(snapshot.source_id)}
              disabled={
                selected.size >= MAX_SELECTION &&
                !selected.has(snapshot.source_id)
              }
              onToggle={() => toggleSource(snapshot.source_id)}
            />
          ))}
        </div>
      )}

      {selected.size >= 2 && (
        <CompareSourcesDetail
          snapshots={selectedSnapshots}
          velocity={velocity24}
          velocityLoading={velocityLoading}
        />
      )}

      {selected.size === 1 && (
        <p className="text-sm text-muted-foreground text-center py-6 border rounded-lg bg-muted/20">
          Select at least one more source to open the comparison (new stories,
          change frequency, and story cards).
        </p>
      )}

      {viewingHistoryId && analysis && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-900 p-4">
          <p className="text-sm text-amber-900 dark:text-amber-100">
            Showing saved AI analysis from{' '}
            {new Date(
              history.find((h) => h.id === viewingHistoryId)?.created_at || 0,
            ).toLocaleString()}
            . Selecting a source above clears this view.
          </p>
          <AnalysisPanel analysis={analysis} />
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Past analyses *
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Open a saved LLM comparison run from history.
          </p>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading history…
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved analyses yet. Run a comparison from the API or a future
              “Analyze” action to build history.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-muted-foreground shrink-0">
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {row.source_names?.map((name, i) => (
                        <Badge
                          key={`${row.id}-${i}-${name}`}
                          variant="secondary"
                          className="text-xs"
                        >
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={viewingHistoryId === row.id ? 'default' : 'outline'}
                    disabled={loadingHistoryId === row.id}
                    onClick={() => handleViewHistory(row.id)}
                    className="shrink-0"
                  >
                    {loadingHistoryId === row.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
