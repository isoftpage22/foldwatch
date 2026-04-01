'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import { SourceTable } from '@/components/dashboard/source-table';
import {
  CrawlIntervalSelect,
  type CrawlIntervalMinutes,
} from '@/components/dashboard/crawl-interval-select';
import { api } from '@/lib/api';
import type { Source } from '@/lib/api';
import type { SchedulerStatus } from '@/lib/api';

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [crawlInterval, setCrawlInterval] = useState<CrawlIntervalMinutes>(30);
  const [submitting, setSubmitting] = useState(false);
  const [autoCrawlOn, setAutoCrawlOn] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Source[]>('/sources');
      setSources(res.data);
    } catch {
      // empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const syncScheduler = () => {
      api
        .get<SchedulerStatus>('/scheduler/status')
        .then((r) => setAutoCrawlOn(r.data.enabled))
        .catch(() => setAutoCrawlOn(null));
    };
    syncScheduler();
    const t = setInterval(syncScheduler, 10_000);
    return () => clearInterval(t);
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/sources', {
        name,
        url,
        crawl_interval_minutes: crawlInterval,
      });
      setName('');
      setUrl('');
      setCrawlInterval(30);
      setOpen(false);
      load();
    } catch {
      // empty
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-[400px] rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sources</h1>
          <p className="text-muted-foreground">
            Manage your monitored web sources.             Use the <span className="font-medium text-foreground">Crawl every</span>{' '}
            dropdown per source (or under Add Source) when Auto-Crawl is on.
          </p>
          {autoCrawlOn === false && (
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-3 py-2">
              Auto-Crawl is off — scheduled crawls and &quot;Crawl now&quot; are
              disabled until you turn it on in the header.
            </p>
          )}
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Source
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Add New Source</SheetTitle>
            </SheetHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="BBC News"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">URL</label>
                <Input
                  placeholder="https://www.bbc.com"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="new-source-crawl-interval" className="text-sm font-medium">
                  Crawl frequency
                </label>
                <CrawlIntervalSelect
                  id="new-source-crawl-interval"
                  value={crawlInterval}
                  onChange={setCrawlInterval}
                />
                <p className="text-xs text-muted-foreground">
                  Used when Auto-Crawl is on (header). 5 / 15 / 30 minutes between
                  due crawls for this source.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Adding...' : 'Add Source'}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <SourceTable
            sources={sources}
            onRefresh={load}
            autoCrawlEnabled={autoCrawlOn}
          />
        </CardContent>
      </Card>
    </div>
  );
}
