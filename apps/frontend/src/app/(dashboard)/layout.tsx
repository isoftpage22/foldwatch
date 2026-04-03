'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Globe,
  Columns,
  Bot,
  Activity,
  Loader2,
  Play,
  Pause,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { CrawlStatus, SchedulerStatus, RunAllCrawlsResult } from '@/lib/api';
import { useState, useEffect, useRef } from 'react';
import { TimeRangeProvider, TimeRangeSelect } from '@/context/time-range-context';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/sources', label: 'Sources', icon: Globe },
  { href: '/compare', label: 'Compare', icon: Columns },
  { href: '/runs', label: 'Agent Runs', icon: Bot },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [runningNow, setRunningNow] = useState(false);
  const [stoppingCrawl, setStoppingCrawl] = useState(false);
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatus | null>(null);
  const [schedulerEnabled, setSchedulerEnabled] = useState<boolean | null>(null);
  const [togglingScheduler, setTogglingScheduler] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** True only when the API reports a run still in `running` (backend reconciles zombies). */
  const isCrawling = Boolean(crawlStatus?.active_run);

  const fetchStatus = async () => {
    try {
      const [crawlRes, schedRes] = await Promise.all([
        api.get<CrawlStatus>('/dashboard/crawl-status'),
        api.get<SchedulerStatus>('/scheduler/status'),
      ]);
      setCrawlStatus(crawlRes.data);
      setSchedulerEnabled(schedRes.data.enabled);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    void fetchStatus();
    pollRef.current = setInterval(() => void fetchStatus(), 10_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleToggleScheduler = async () => {
    setTogglingScheduler(true);
    try {
      const res = await api.patch<SchedulerStatus>('/scheduler/toggle');
      setSchedulerEnabled(res.data.enabled);
    } catch {
      // silent
    } finally {
      setTogglingScheduler(false);
    }
  };

  const handleStopCrawl = async () => {
    setStoppingCrawl(true);
    try {
      await api.post('/scheduler/stop-crawl', {});
      setTimeout(() => void fetchStatus(), 1000);
    } catch {
      // silent
    } finally {
      setTimeout(() => setStoppingCrawl(false), 2000);
    }
  };

  const handleRunNow = async () => {
    if (schedulerEnabled !== true) return;
    setRunningNow(true);
    try {
      await api.post<RunAllCrawlsResult>('/scheduler/run-all-now', {});
      setTimeout(() => void fetchStatus(), 1000);
    } catch {
      // silent fail
    } finally {
      setTimeout(() => setRunningNow(false), 2000);
    }
  };

  return (
    <TimeRangeProvider>
    <div className="flex h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col border-r bg-muted/30">
        <div className="flex items-center gap-2 px-6 py-5 border-b">
          <Activity className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold tracking-tight">FoldWatch</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-2 md:hidden">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-bold">FoldWatch</span>
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <TimeRangeSelect className="order-first sm:order-none" />
            {isCrawling ? (
              <div className="flex flex-col items-end gap-0.5">
                <div className="flex items-center gap-1.5 text-xs text-blue-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Agent run in progress</span>
                </div>
                {schedulerEnabled === false && (
                  <span className="text-[10px] text-muted-foreground max-w-[220px] text-right leading-tight">
                    Auto-Crawl is off; a run started earlier may still be finishing.
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                <span>No active agent run</span>
              </div>
            )}

            {schedulerEnabled !== null && (
              <button
                onClick={handleToggleScheduler}
                disabled={togglingScheduler}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border',
                  schedulerEnabled
                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-950 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900'
                    : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900',
                )}
                title={schedulerEnabled ? 'Auto-crawling is active — click to pause' : 'Auto-crawling is paused — click to resume'}
              >
                {togglingScheduler ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : schedulerEnabled ? (
                  <Pause className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                {schedulerEnabled ? 'Auto-Crawl On' : 'Auto-Crawl Off'}
              </button>
            )}

            <span className="text-xs text-muted-foreground">
              {new Date().toLocaleString()}
            </span>
            {isCrawling ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleStopCrawl}
                disabled={stoppingCrawl}
              >
                {stoppingCrawl ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Square className="h-3 w-3 mr-1.5 fill-current" />
                )}
                {stoppingCrawl ? 'Stopping...' : 'Stop Crawl'}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleRunNow}
                disabled={
                  runningNow ||
                  schedulerEnabled !== true ||
                  schedulerEnabled === null
                }
                title={
                  schedulerEnabled === false
                    ? 'Turn Auto-Crawl on to run crawls'
                    : schedulerEnabled === null
                      ? 'Loading scheduler status…'
                      : 'Crawl all active sources in parallel (see CRAWL_CONCURRENCY on the server)'
                }
              >
                {runningNow ? 'Starting…' : 'Run all sources'}
              </Button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
    </TimeRangeProvider>
  );
}
