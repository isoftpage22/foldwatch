'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { freshnessColor, timeAgo } from '@/lib/format';
import type { DashboardStats, Snapshot } from '@/lib/api';

export function PerSourceFreshnessCards({
  snapshots,
  stats,
}: {
  snapshots: Snapshot[];
  stats: DashboardStats;
}) {
  if (snapshots.length === 0) {
    return null;
  }

  const freshestName = stats.freshest_source?.name ?? null;
  const stalestName = stats.stalest_source?.name ?? null;

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

          return (
            <Card
              key={snap.source_id}
              className="w-[200px] shrink-0 border-muted"
            >
              <CardHeader className="py-3 pb-1">
                <CardTitle className="text-sm font-medium truncate">
                  {name}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div
                  className={`text-2xl font-bold tabular-nums ${freshnessColor(score)}`}
                >
                  {score.toFixed(4)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Page time:{' '}
                  {snap.modified_at ? timeAgo(snap.modified_at) : '—'}
                </p>
                <div className="flex flex-wrap gap-1">
                  {isFreshest && (
                    <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                      Freshest
                    </Badge>
                  )}
                  {isStalest && (
                    <Badge variant="secondary" className="text-[10px]">
                      Stalest
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
