'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Newspaper } from 'lucide-react';
import {
  crawlUpdatedLabel,
  onFoldSinceLabel,
  sourceUpdatedLabel,
} from '@/lib/format';
import type { Snapshot, StoryItem } from '@/lib/api';
function faviconUrl(storyUrl: string | undefined, fallbackSiteUrl: string): string | null {
  try {
    const u = storyUrl?.trim()
      ? new URL(storyUrl)
      : new URL(fallbackSiteUrl);
    const host = u.hostname.replace(/^www\./, '');
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return null;
  }
}

export function CompareStoryCard({
  story,
  snapshot,
}: {
  story: StoryItem;
  snapshot: Snapshot;
}) {
  const siteUrl = snapshot.source?.url || 'https://example.com';
  const iconSrc = faviconUrl(story.url, siteUrl);
  const [iconOk, setIconOk] = useState(Boolean(iconSrc));

  const tenure = onFoldSinceLabel(story.first_seen_at, snapshot.created_at);
  const sourceTimeIso =
    story.source_updated_at ??
    snapshot.modified_at ??
    snapshot.published_at ??
    null;
  const sourceUpdated = sourceUpdatedLabel(sourceTimeIso);

  return (
    <Card className="overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
      <div className="flex gap-0 min-h-[4.5rem]">
        <div className="w-14 sm:w-16 shrink-0 bg-muted flex items-center justify-center border-r">
          {iconOk && iconSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={iconSrc}
              alt=""
              className="w-9 h-9 rounded-md bg-background p-1 object-contain shadow-sm"
              onError={() => setIconOk(false)}
            />
          ) : (
            <Newspaper className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <CardContent className="p-2.5 sm:p-3 flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1">
            {story.is_new_since_last_crawl && (
              <Badge className="text-[10px] h-5 px-1.5 bg-emerald-600 hover:bg-emerald-600">
                New this crawl
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal">
              {tenure === '—' ? 'First seen this crawl' : tenure}
            </Badge>
            {sourceUpdated ? (
              <Badge className="text-[10px] h-5 px-1.5 updated-live-badge bg-blue-600 hover:bg-blue-600">
                {sourceUpdated}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                Source timing not available
              </Badge>
            )}
          </div>
          {story.url ? (
            <a
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium leading-snug text-foreground hover:text-primary line-clamp-3"
            >
              {story.title}
            </a>
          ) : (
            <p className="text-sm font-medium leading-snug line-clamp-3">{story.title}</p>
          )}
          {story.first_seen_at && (
            <p className="text-[10px] text-muted-foreground">
              In system since{' '}
              {new Date(story.first_seen_at).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            {crawlUpdatedLabel(snapshot.created_at)}
          </p>
        </CardContent>
      </div>
    </Card>
  );
}
