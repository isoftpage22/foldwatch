'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  CrawlIntervalSelect,
  normalizeCrawlInterval,
  type CrawlIntervalMinutes,
} from '@/components/dashboard/crawl-interval-select';
import { api } from '@/lib/api';
import type { SchedulerStatus, Source, Snapshot } from '@/lib/api';
import {
  crawlUpdatedLabel,
  formatDate,
  freshnessBg,
  freshnessLabel,
  sourceUpdatedLabel,
  timeAgo,
} from '@/lib/format';

export default function SourceDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [source, setSource] = useState<Source | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [intervalSaving, setIntervalSaving] = useState(false);
  const [autoCrawlOn, setAutoCrawlOn] = useState<boolean | null>(null);

  useEffect(() => {
    const sync = () => {
      api
        .get<SchedulerStatus>('/scheduler/status')
        .then((r) => setAutoCrawlOn(r.data.enabled))
        .catch(() => setAutoCrawlOn(null));
    };
    sync();
    const t = setInterval(sync, 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [sourcesRes, historyRes] = await Promise.all([
          api.get<Source[]>('/sources'),
          api.get<Snapshot[]>(`/snapshots/${id}/history`),
        ]);
        const found = sourcesRes.data.find((s: Source) => s.id === id);
        setSource(found || null);
        setSnapshots(
          Array.isArray(historyRes.data) ? historyRes.data : [],
        );
      } catch {
        // empty
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const setCrawlInterval = async (minutes: CrawlIntervalMinutes) => {
    if (!source || source.crawl_interval_minutes === minutes) return;
    setIntervalSaving(true);
    try {
      const res = await api.patch<Source>(
        `/sources/${id}/crawl-interval`,
        { crawl_interval_minutes: minutes },
      );
      setSource(res.data);
    } catch {
      // silent
    } finally {
      setIntervalSaving(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-[600px] rounded-xl" />;
  }

  if (!source) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Source not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{source.name}</h1>
        <p className="text-muted-foreground">{source.url}</p>
      </div>

      {autoCrawlOn === false && (
        <p className="text-sm text-amber-800 dark:text-amber-200 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-3 py-2">
          Auto-Crawl is off — this source will not be crawled until you turn it
          on in the header.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 space-y-2">
            <label
              htmlFor="detail-crawl-interval"
              className="text-sm text-muted-foreground block"
            >
              Crawl frequency
            </label>
            <CrawlIntervalSelect
              id="detail-crawl-interval"
              value={normalizeCrawlInterval(source.crawl_interval_minutes)}
              disabled={intervalSaving}
              onChange={(v) => void setCrawlInterval(v)}
            />
            <p className="text-xs text-muted-foreground">
              How often this source is due when Auto-Crawl is on.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Status</div>
            <Badge
              variant="secondary"
              className={
                source.status === 'active'
                  ? 'bg-green-100 text-green-800 mt-1'
                  : 'bg-yellow-100 text-yellow-800 mt-1'
              }
            >
              {source.status}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Last Crawled</div>
            <div className="text-lg font-semibold mt-1">
              {timeAgo(source.last_crawled_at)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Failures</div>
            <div className="text-lg font-semibold mt-1">
              {source.failure_count}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Snapshot History</CardTitle>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No snapshots yet. Run the agent to create the first snapshot.
            </p>
          ) : (
            <div className="space-y-4">
              {snapshots.map((snap, idx) => {
                const prev = snapshots[idx + 1];
                const headlineChanged =
                  prev && prev.headline !== snap.headline;

                return (
                  <div key={snap.id}>
                    <div className="flex gap-4 p-4 border rounded-lg">
                      {snap.hero_image_url && (
                        <img
                          src={snap.hero_image_url}
                          alt=""
                          className="w-24 h-16 object-cover rounded flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">
                            {snap.headline || 'No headline'}
                          </h3>
                          {headlineChanged && (
                            <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                              Changed
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {snap.summary || 'No summary'}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <Badge
                            variant="secondary"
                            className={freshnessBg(snap.freshness_score)}
                          >
                            {freshnessLabel(snap.freshness_score)}{' '}
                            {snap.freshness_score?.toFixed(4)}
                          </Badge>
                          {snap.modified_at ? (
                            <Badge className="text-xs updated-live-badge bg-blue-600 hover:bg-blue-600">
                              {sourceUpdatedLabel(snap.modified_at)}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Source timing not available
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {crawlUpdatedLabel(snap.created_at)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatDate(snap.created_at)}</span>
                          {snap.date_source && (
                            <Badge variant="outline" className="text-xs">
                              {snap.date_source}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {idx < snapshots.length - 1 && (
                      <Separator className="my-2" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
