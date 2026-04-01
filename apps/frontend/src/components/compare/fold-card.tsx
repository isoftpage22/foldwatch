import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Newspaper, Video } from 'lucide-react';
import { RecencyBadge } from './recency-badge';
import {
  crawlUpdatedLabel,
  onFoldSinceLabel,
  sourceUpdatedLabel,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Snapshot } from '@/lib/api';

interface FoldCardProps {
  snapshot: Snapshot;
  selectable?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onToggle?: () => void;
  /** Hide inline story lists — use when the parent page shows full story cards below. */
  compactPicker?: boolean;
}

export function FoldCard({
  snapshot,
  selectable,
  selected,
  disabled,
  onToggle,
  compactPicker,
}: FoldCardProps) {
  return (
    <Card
      className={cn(
        'overflow-hidden flex flex-col transition-all',
        selectable && 'cursor-pointer',
        selected && 'ring-2 ring-primary',
        disabled && !selected && 'opacity-50',
      )}
      onClick={selectable && !disabled ? onToggle : undefined}
    >
      <div className="relative">
        {selectable && (
          <div className="absolute top-3 left-3 z-10">
            <div
              className={cn(
                'h-5 w-5 rounded border-2 flex items-center justify-center transition-colors',
                selected
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'bg-background/80 border-muted-foreground/40',
              )}
            >
              {selected && <Check className="h-3 w-3" />}
            </div>
          </div>
        )}
        {snapshot.hero_image_url ? (
          <div className="aspect-video w-full overflow-hidden bg-muted">
            <img
              src={snapshot.hero_image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="aspect-video w-full bg-muted flex items-center justify-center">
            <span className="text-muted-foreground text-sm">No image</span>
          </div>
        )}
      </div>

      <CardContent className="flex-1 flex flex-col p-4">
        <div className="mb-1 text-xs text-muted-foreground truncate">
          {snapshot.source?.name || 'Unknown'} &middot;{' '}
          <a
            href={snapshot.source?.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {snapshot.source?.url}
          </a>
        </div>

        <h3 className="font-semibold leading-snug line-clamp-2 mb-2">
          {snapshot.headline || 'No headline'}
        </h3>

        <p className="text-sm text-muted-foreground line-clamp-3 mb-auto">
          {snapshot.summary || 'No summary available'}
        </p>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap">
          <RecencyBadge score={snapshot.freshness_score} />
          {snapshot.modified_at ? (
            <Badge className="text-xs updated-live-badge bg-blue-600 hover:bg-blue-600">
              {sourceUpdatedLabel(snapshot.modified_at)}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              Source timing not available
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {crawlUpdatedLabel(snapshot.created_at)}
          </Badge>
          <Badge
            variant={(snapshot.stories?.length ?? 0) > 0 ? 'secondary' : 'outline'}
            className="text-xs flex items-center gap-1"
          >
            <Newspaper className="h-3 w-3" />
            {(snapshot.stories?.length ?? 0)}{' '}
            {(snapshot.stories?.length ?? 0) === 1 ? 'story' : 'stories'}
          </Badge>
          {(snapshot.video_urls?.length ?? 0) > 0 && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1">
              <Video className="h-3 w-3" />
              {snapshot.video_urls!.length} {snapshot.video_urls!.length === 1 ? 'video' : 'videos'}
            </Badge>
          )}
          {snapshot.date_source && (
            <Badge variant="outline" className="text-xs ml-auto">
              {snapshot.date_source}
            </Badge>
          )}
        </div>

        {!compactPicker && snapshot.new_stories && snapshot.new_stories.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              New since last crawl
            </p>
            <ul className="space-y-1.5 text-sm">
              {snapshot.new_stories.map((st, i) => (
                <li key={i} className="line-clamp-2">
                  {st.url ? (
                    <a
                      href={st.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {st.title}
                    </a>
                  ) : (
                    <span>{st.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!compactPicker && snapshot.stories && snapshot.stories.length > 0 && (
          <details
            className="mt-3 pt-3 border-t group"
            onClick={(e) => e.stopPropagation()}
          >
            <summary className="text-xs font-medium text-muted-foreground cursor-pointer list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden">
              <span className="group-open:rotate-90 transition-transform inline-block">
                ▸
              </span>
              Full fold ({snapshot.stories.length} stories)
            </summary>
            <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto pr-1">
              {snapshot.stories.map((st, i) => (
                <li key={i} className="text-xs flex flex-col gap-1 border-b border-border/40 pb-2 last:border-0">
                  <div className="flex flex-wrap items-center gap-1">
                    {st.is_new_since_last_crawl && (
                      <Badge className="text-[10px] px-1.5 py-0 h-5 bg-emerald-600">
                        New
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                      {onFoldSinceLabel(st.first_seen_at, snapshot.created_at)}
                    </Badge>
                    {st.source_updated_at ? (
                      <Badge className="text-[10px] px-1.5 py-0 h-5 updated-live-badge bg-blue-600 hover:bg-blue-600">
                        {sourceUpdatedLabel(st.source_updated_at)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                        Source timing not available
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                      {crawlUpdatedLabel(snapshot.created_at)}
                    </Badge>
                  </div>
                  {st.url ? (
                    <a
                      href={st.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline line-clamp-2"
                    >
                      {st.title}
                    </a>
                  ) : (
                    <span className="line-clamp-2">{st.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
