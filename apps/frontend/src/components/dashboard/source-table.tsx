'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pause,
  Play,
  RefreshCw,
  Trash2,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { timeAgo, freshnessColor } from '@/lib/format';
import { api } from '@/lib/api';
import type { Source, Snapshot, CrawlNowResult } from '@/lib/api';
import {
  CrawlIntervalSelect,
  normalizeCrawlInterval,
  type CrawlIntervalMinutes,
} from '@/components/dashboard/crawl-interval-select';

interface Props {
  sources: Source[];
  onRefresh: () => void;
  /** When false, &quot;Crawl now&quot; is disabled (matches backend). */
  autoCrawlEnabled?: boolean | null;
}

function getLatestSnapshot(source: Source): Snapshot | undefined {
  if (!source.snapshots?.length) return undefined;
  return [...source.snapshots].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}

export function SourceTable({
  sources,
  onRefresh,
  autoCrawlEnabled,
}: Props) {
  const router = useRouter();
  const [crawling, setCrawling] = useState<Set<string>>(new Set());
  const [crawlMessage, setCrawlMessage] = useState<string | null>(null);
  const [intervalSavingId, setIntervalSavingId] = useState<string | null>(null);

  /** Backend only accepts crawls when the DB scheduler flag is on. */
  const canTriggerCrawl = autoCrawlEnabled === true;

  const handlePause = async (id: string) => {
    await api.patch(`/sources/${id}/pause`);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/sources/${id}`);
    onRefresh();
  };

  const handleIntervalChange = async (id: string, minutes: CrawlIntervalMinutes) => {
    setIntervalSavingId(id);
    try {
      await api.patch(`/sources/${id}/crawl-interval`, {
        crawl_interval_minutes: minutes,
      });
      onRefresh();
    } catch {
      // silent
    } finally {
      setIntervalSavingId(null);
    }
  };

  const handleCrawlNow = async (id: string) => {
    if (!canTriggerCrawl) {
      setCrawlMessage('Turn Auto-Crawl on in the header to run crawls.');
      return;
    }
    setCrawlMessage(null);
    setCrawling((prev) => new Set(prev).add(id));
    try {
      const res = await api.post<CrawlNowResult>(`/sources/${id}/crawl-now`, {});
      if (!res.data.started) {
        setCrawlMessage(
          res.data.reason === 'scheduler_disabled'
            ? 'Turn auto-crawl on to run manual crawls.'
            : res.data.reason === 'already_running'
              ? 'A crawl is already running for this source.'
              : 'Could not start crawl.',
        );
      } else {
        onRefresh();
      }
      setTimeout(() => {
        setCrawling((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 30_000);
    } catch {
      setCrawling((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const getLatestFreshness = (source: Source): number | null => {
    if (!source.snapshots?.length) return null;
    const sorted = [...source.snapshots].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return sorted[0].freshness_score;
  };

  return (
    <div className="space-y-2">
      {crawlMessage && (
        <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          {crawlMessage}
        </p>
      )}
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>URL</TableHead>
          <TableHead className="min-w-[11rem]">Crawl every</TableHead>
          <TableHead>New*</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last Crawled</TableHead>
          <TableHead className="text-right">Freshness</TableHead>
          <TableHead className="text-right">Failures</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sources.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={9}
              className="text-center text-muted-foreground py-8"
            >
              No sources added yet. Click &quot;Add Source&quot; to get started.
            </TableCell>
          </TableRow>
        )}
        {sources.map((source) => {
          const freshness = getLatestFreshness(source);
          const isCrawling = crawling.has(source.id);
          const latest = getLatestSnapshot(source);
          const newCount = latest?.new_stories?.length ?? 0;
          return (
            <TableRow key={source.id}>
              <TableCell className="font-medium">
                <button
                  className="hover:underline text-left"
                  onClick={() => router.push(`/sources/${source.id}`)}
                >
                  {source.name}
                </button>
              </TableCell>
              <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                {source.url}
              </TableCell>
              <TableCell className="py-2">
                <CrawlIntervalSelect
                  aria-label={`Crawl frequency for ${source.name}`}
                  className="h-8 text-xs"
                  value={normalizeCrawlInterval(source.crawl_interval_minutes)}
                  disabled={intervalSavingId === source.id}
                  onChange={(v) => void handleIntervalChange(source.id, v)}
                />
              </TableCell>
              <TableCell className="text-sm tabular-nums text-muted-foreground">
                {newCount > 0 ? newCount : '—'}
              </TableCell>
              <TableCell>
                {isCrawling ? (
                  <Badge
                    variant="secondary"
                    className="bg-blue-100 text-blue-800 animate-pulse"
                  >
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    crawling
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className={
                      source.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : source.status === 'paused'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                    }
                  >
                    {source.status}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {timeAgo(source.last_crawled_at)}
              </TableCell>
              <TableCell
                className={`text-right font-mono ${freshnessColor(freshness)}`}
              >
                {freshness !== null ? freshness.toFixed(4) : '—'}
              </TableCell>
              <TableCell className="text-right">{source.failure_count}</TableCell>
              <TableCell className="text-right">
                <div className="flex gap-1 justify-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handlePause(source.id)}
                    title={source.status === 'paused' ? 'Resume' : 'Pause'}
                  >
                    {source.status === 'paused' ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleCrawlNow(source.id)}
                    title={
                      canTriggerCrawl
                        ? 'Crawl now'
                        : 'Turn Auto-Crawl on to crawl'
                    }
                    disabled={isCrawling || !canTriggerCrawl}
                  >
                    {isCrawling ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => router.push(`/sources/${source.id}`)}
                    title="View Detail"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleDelete(source.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    <p className="text-xs text-muted-foreground">
      *New = stories new on the latest snapshot vs the prior crawl. Crawls run
      only when Auto-Crawl is on (header).
    </p>
    </div>
  );
}
