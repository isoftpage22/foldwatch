'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { freshnessColor, timeAgo } from '@/lib/format';
import type {
  DashboardStats,
  OverviewWindowSourceRow,
  Snapshot,
} from '@/lib/api';

function rowBySourceId(
  rows: OverviewWindowSourceRow[],
): Map<string, OverviewWindowSourceRow> {
  return new Map(rows.map((r) => [r.source_id, r]));
}

export function PerSourceFreshnessCards({
  snapshots,
  stats,
  windowRows,
  timeRangeLabel,
  windowLoading,
}: {
  snapshots: Snapshot[];
  stats: DashboardStats;
  windowRows: OverviewWindowSourceRow[];
  timeRangeLabel: string;
  windowLoading: boolean;
}) {
  if (snapshots.length === 0) {
    return null;
  }

  const freshestName = stats.freshest_source?.name ?? null;
  const stalestName = stats.stalest_source?.name ?? null;
  const byId = rowBySourceId(windowRows);

  return (
    <div className="overflow-x-auto pb-1 -mx-1 px-1">
      <div className="flex gap-3 min-w-min">
        {snapshots.map((snap) => {
          const score = snap.freshness_score ?? 0;
          const name = snap.source?.name ?? 'Unknown';
          const isFreshest = freshestName != null && name === freshestName;
          const isStalest =
            stalestName != null &&
            name === stalestName &&
            freshestName !== stalestName;
          const row = byId.get(snap.source_id);
          const totalNew = row?.window_total_new_stories;

          return (
            <Card
              key={snap.source_id}
              className="w-[280px] shrink-0 border-muted"
            >
              <CardHeader className="py-3 pb-1 space-y-1">
                <CardTitle className="text-sm font-medium truncate">
                  {name}
                </CardTitle>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  New stories on fold · last {timeRangeLabel}
                </p>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {windowLoading ? (
                  <p className="text-xs text-muted-foreground animate-pulse">
                    Loading window totals…
                  </p>
                ) : row ? (
                  <>
                    <div className="text-3xl font-bold tabular-nums text-foreground">
                      {totalNew ?? 0}
                    </div>
                    {/* <p className="text-xs text-muted-foreground leading-snug">
                      Total new stories in window (sum of{' '}
                      <span className="font-medium">new_stories</span> on each
                      snapshot in the DB).
                    </p> */}
                    {/* <div className="rounded-md border bg-muted/40 px-2 py-1.5 text-xs space-y-1">
                      <p className="font-medium text-foreground">
                        Also in last {timeRangeLabel}
                      </p>
                      <p className="text-muted-foreground tabular-nums">
                        <span className="text-foreground font-medium">
                          {row.snapshot_count}
                        </span>{' '}
                        {row.snapshot_count === 1 ? 'crawl' : 'crawls'} ·{' '}
                        <span className="text-foreground font-medium">
                          {row.stories_first_seen_in_window}
                        </span>{' '}
                        first seen on fold (presence)
                      </p>
                    </div> */}
                  </>
                ) : null}
                {/* <div className="pt-1 border-t border-dashed space-y-1">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Page recency (latest crawl)
                  </p>
                  <div
                    className={`text-lg font-semibold tabular-nums ${freshnessColor(score)}`}
                  >
                    {score.toFixed(4)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Page updated:{' '}
                    {snap.modified_at ? timeAgo(snap.modified_at) : '—'}
                  </p>
                </div> */}
                {/* <div className="flex flex-wrap gap-1">
                  {isFreshest && (
                    <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                      Freshest page
                    </Badge>
                  )}
                  {isStalest && (
                    <Badge variant="secondary" className="text-[10px]">
                      Stalest page
                    </Badge>
                  )}
                </div> */}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
