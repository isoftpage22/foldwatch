'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';
import { CompareStoryCard } from '@/components/compare/compare-story-card';
import type {
  PublishingVelocityResponse,
  Snapshot,
  StoriesInWindowResponse,
  StoryInWindowRow,
  StoryItem,
} from '@/lib/api';
import { crawlUpdatedLabel, sourceUpdatedLabel } from '@/lib/format';

const MAX_STORIES = 30;

export function CompareSourcesDetail({
  snapshots,
  velocity,
  velocityLoading,
  storiesInWindow,
  storiesInWindowLoading,
  storiesInWindowError,
  timeRangeLabel,
}: {
  snapshots: Snapshot[];
  velocity: PublishingVelocityResponse | null;
  velocityLoading: boolean;
  storiesInWindow: StoriesInWindowResponse | null;
  storiesInWindowLoading: boolean;
  storiesInWindowError: string | null;
  timeRangeLabel: string;
}) {
  void velocity;
  void velocityLoading;

  const bySourceId = new Map(
    (storiesInWindow?.sources ?? []).map((s) => [s.source_id, s]),
  );

  return (
    <div className="space-y-6">
      {/* New stories + change frequency (replaces LLM analysis on this page) */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Comparison summary
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Stories <span className="font-medium text-foreground">first seen</span>{' '}
            in the last <span className="font-medium text-foreground">{timeRangeLabel}</span>{' '}
            (from fold presence, not only vs the previous crawl). Use the global
            time-range control in the header.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {storiesInWindowError && (
            <p className="text-sm text-destructive">{storiesInWindowError}</p>
          )}
          {storiesInWindowLoading && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              Loading window summary…
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {snapshots.map((snap) => {
              const row = bySourceId.get(snap.source_id);
              const newList = row?.stories ?? [];
              const foldTotal = row?.stories_on_fold ?? Math.min(snap.stories?.length ?? 0, MAX_STORIES);
              return (
                <div
                  key={snap.source_id}
                  className="rounded-xl border bg-card p-4 space-y-2"
                >
                  <p className="font-semibold text-sm">{snap.source?.name}</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {newList.length}
                    <span className="text-sm font-normal text-muted-foreground ml-1">
                      new in window of {foldTotal}
                    </span>
                  </p>
                  {newList.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No stories first-seen in this window.
                    </p>
                  ) : (
                    <ul className="text-xs space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {newList.map((st: StoryInWindowRow, i: number) => (
                        <li key={i} className="line-clamp-2">
                          {st.url ? (
                            <a
                              href={st.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {st.title}
                            </a>
                          ) : (
                            st.title
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* <Card className="bg-muted/40">
            <CardHeader className="py-3 pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Data change frequency (last 24h)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {velocityLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              )}
              {!velocityLoading && velocity && velocity.sources.length > 0 && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {velocity.sources.map((s) => (
                      <div
                        key={s.source_id}
                        className="rounded-lg border bg-background p-3 text-sm space-y-1"
                      >
                        <p className="font-medium">{s.source_name}</p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          <li>
                            <span className="text-foreground font-medium tabular-nums">
                              {s.total_new_in_window}
                            </span>{' '}
                            new fold stories in window
                          </li>
                          <li>{s.crawl_count_in_window} crawls recorded</li>
                          <li>
                            ~{s.avg_new_per_crawl} new / crawl · ~
                            {s.estimated_new_per_hour} / hr (interval-adjusted)
                          </li>
                        </ul>
                      </div>
                    ))}
                  </div>
                  {fasterName ? (
                    <p className="text-sm rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900 px-3 py-2">
                      <span className="font-medium text-foreground">{fasterName}</span>{' '}
                      shows a higher estimated rate of new first-fold stories per hour
                      in this window (raw totals differ if crawl counts differ).
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Rates are similar, or not enough history yet for a clear leader.
                    </p>
                  )}
                </>
              )}
              {!velocityLoading &&
                (!velocity || velocity.sources.length === 0) && (
                  <p className="text-sm text-muted-foreground">
                    Not enough snapshot history in the last 24 hours to score
                    change frequency yet.
                  </p>
                )}
            </CardContent>
          </Card> */}
        </CardContent>
      </Card>

      {/* Up to 30 stories per source — card grid */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-3">
          First fold — up to {MAX_STORIES} stories per source
        </h2>
        <div
          className={`grid gap-6 ${
            snapshots.length >= 3
              ? 'lg:grid-cols-3'
              : snapshots.length === 2
                ? 'lg:grid-cols-2'
                : 'grid-cols-1'
          }`}
        >
          {snapshots.map((snap) => {
            const list = (snap.stories ?? []).slice(0, MAX_STORIES);
            return (
              <div key={snap.source_id} className="space-y-3 min-w-0">
                <div className="rounded-xl border overflow-hidden bg-muted/20">
                  {snap.hero_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={snap.hero_image_url}
                      alt=""
                      className="w-full h-28 object-cover"
                    />
                  ) : (
                    <div className="h-28 bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      No hero image
                    </div>
                  )}
                  <div className="p-3 border-t bg-card">
                    <p className="font-semibold">{snap.source?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {snap.source?.url}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
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
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        {list.length} stories
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {snap.new_stories?.length ?? 0} new
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-[70vh] overflow-y-auto pr-1">
                  {list.map((st, i) => (
                    <CompareStoryCard
                      key={`${snap.source_id}-${i}-${st.title.slice(0, 24)}`}
                      story={st}
                      snapshot={snap}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
