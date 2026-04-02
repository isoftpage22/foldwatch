/**
 * LLM comparison UI — Article-by-Article section is shown by default.
 * Other blocks are kept behind SHOW_FULL_ANALYSIS for easy re-enable.
 */
'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import {
  Award,
  Newspaper,
  Video,
  ExternalLink,
  ArrowRightLeft,
  Clock,
  ListChecks,
} from 'lucide-react';
import type { ComparisonAnalysis, Snapshot, StoryItem } from '@/lib/api';
import {
  crawlUpdatedLabel,
  formatDate,
  onFoldSinceLabel,
  sourceUpdatedLabel,
} from '@/lib/format';

/** Set true to show freshness, keywords, story comparison, video, verdict, etc. */
const SHOW_FULL_ANALYSIS = false;

const readabilityColor: Record<string, string> = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-red-100 text-red-800',
};

function ScoreBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color =
    pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium w-6 text-right">{value}</span>
    </div>
  );
}

function normTitle(s: string) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function storyMatchingHeadline(
  snapshot: Snapshot | undefined,
  headline: string,
): StoryItem | null {
  if (!snapshot?.stories?.length) return null;
  const t = normTitle(headline);
  const exact = snapshot.stories.find((s) => normTitle(s.title) === t);
  if (exact) return exact;
  return (
    snapshot.stories.find(
      (s) =>
        t.includes(normTitle(s.title).slice(0, 48)) ||
        normTitle(s.title).includes(t.slice(0, 48)),
    ) ?? null
  );
}

function faviconUrl(
  storyUrl: string | undefined,
  fallbackSiteUrl: string,
): string | null {
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

function isHttpUrl(s: string | undefined | null): s is string {
  if (!s?.trim()) return false;
  try {
    const u = new URL(s.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Prefer per-story URL from crawl; fall back to source site URL. */
function storyOpenHref(
  storyMeta: StoryItem | null,
  snapshot: Snapshot | undefined,
): string | null {
  if (storyMeta?.url && isHttpUrl(storyMeta.url)) return storyMeta.url.trim();
  const site = snapshot?.source?.url;
  if (site && isHttpUrl(site)) return site.trim();
  return null;
}

function MatchedArticleSourceCard({
  source,
  snapshot,
  freshnessModifiedAt,
}: {
  source: ComparisonAnalysis['matched_stories'][0]['covered_by'][0];
  snapshot: Snapshot | undefined;
  freshnessModifiedAt: string | null | undefined;
}) {
  const siteUrl = snapshot?.source?.url || 'https://example.com';
  const storyMeta = storyMatchingHeadline(snapshot, source.title);
  const iconSrc = faviconUrl(storyMeta?.url, siteUrl);
  const [iconOk, setIconOk] = useState(Boolean(iconSrc));

  const tenure = onFoldSinceLabel(
    storyMeta?.first_seen_at,
    snapshot?.created_at,
  );
  const sourceTimeIso =
    storyMeta?.source_updated_at ??
    snapshot?.modified_at ??
    snapshot?.published_at ??
    freshnessModifiedAt ??
    null;
  const sourceUpdated = sourceUpdatedLabel(sourceTimeIso);
  const openHref = storyOpenHref(storyMeta, snapshot);

  const card = (
    <Card
      className={`overflow-hidden border shadow-sm ${
        openHref
          ? 'hover:shadow-md transition-shadow cursor-pointer'
          : ''
      }`}
    >
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
            <Badge
              variant="secondary"
              className="text-[10px] h-5 px-1.5 font-normal"
            >
              {tenure === '—' ? 'First seen this crawl' : tenure}
            </Badge>
            {sourceUpdated ? (
              <Badge className="text-[10px] h-5 px-1.5 updated-live-badge bg-blue-600 hover:bg-blue-600">
                {sourceUpdated}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] h-5 px-1.5 font-normal"
              >
                Source timing not available
              </Badge>
            )}
            {source.filed_first ? (
              <Badge
                variant="secondary"
                className="text-[10px] h-5 px-1.5 bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400 flex items-center gap-0.5"
              >
                <Clock className="h-2.5 w-2.5" />
                Filed first
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                Later
              </Badge>
            )}
          </div>
          <p className="text-sm font-serif font-medium leading-snug text-foreground line-clamp-3">
            {source.title}
          </p>
          <p className="text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground/70">Source time: </span>
            {sourceTimeIso
              ? formatDate(sourceTimeIso)
              : 'Not captured for this crawl'}
          </p>
          {storyMeta?.first_seen_at && (
            <p className="text-[10px] text-muted-foreground">
              In system since{' '}
              {formatDate(storyMeta.first_seen_at)}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            {snapshot?.created_at
              ? crawlUpdatedLabel(snapshot.created_at)
              : 'No snapshot loaded for this source'}
          </p>
          <p className="text-[10px] font-medium text-muted-foreground truncate">
            {source.source_name}
          </p>
        </CardContent>
      </div>
    </Card>
  );

  if (!openHref) {
    return card;
  }

  return (
    <a
      href={openHref}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`Open story in new tab: ${source.title} (${source.source_name})`}
    >
      {card}
    </a>
  );
}

export function AnalysisPanel({
  analysis,
  snapshots,
}: {
  analysis: ComparisonAnalysis;
  snapshots?: Snapshot[] | null;
}) {
  const snapshotBySourceId = useMemo(() => {
    const m = new Map<string, Snapshot>();
    for (const s of snapshots ?? []) {
      m.set(s.source_id, s);
    }
    return m;
  }, [snapshots]);

  const freshnessBySourceId = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of analysis.freshness_ranking) {
      m.set(r.source_id, r.modified_at);
    }
    return m;
  }, [analysis.freshness_ranking]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">AI Analysis</h2>

      {SHOW_FULL_ANALYSIS && (
        <>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-start gap-3 py-4">
              <Award className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">
                  Best for readers: {analysis.best_for_reader.source_name}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {analysis.best_for_reader.reason}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Freshness Ranking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {analysis.freshness_ranking.map((item, i) => (
                <div
                  key={item.source_id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-xs w-6 justify-center"
                    >
                      {i + 1}
                    </Badge>
                    <span className="font-medium">{item.source_name}</span>
                    {item.posted_first && (
                      <Badge
                        variant="secondary"
                        className="text-xs bg-green-100 text-green-800"
                      >
                        First
                      </Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {item.freshness_score?.toFixed(4) ?? 'N/A'}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Content Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {analysis.content_analysis.map((item) => (
                  <div key={item.source_id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{item.source_name}</p>
                      <Badge
                        variant="secondary"
                        className={readabilityColor[item.readability] || ''}
                      >
                        {item.readability} readability
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        Detail Level
                      </div>
                      <ScoreBar value={item.detail_level} />
                    </div>
                    {item.strengths.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-green-700 mb-1">
                          Strengths
                        </p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {item.strengths.map((s, i) => (
                            <li key={i}>+ {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {item.weaknesses.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-red-700 mb-1">
                          Weaknesses
                        </p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {item.weaknesses.map((w, i) => (
                            <li key={i}>- {w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Keyword Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {analysis.keyword_analysis.map((item) => (
                  <div key={item.source_id} className="space-y-2">
                    <p className="text-sm font-medium">{item.source_name}</p>
                    {item.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.keywords.map((kw) => (
                          <Badge key={kw} variant="secondary" className="text-xs">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {item.unique_keywords.length > 0 && (
                      <div>
                        <Separator className="my-1" />
                        <p className="text-xs text-muted-foreground mb-1">
                          Unique to this source
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {item.unique_keywords.map((kw) => (
                            <Badge
                              key={kw}
                              variant="outline"
                              className="text-xs border-primary/30 text-primary"
                            >
                              {kw}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {item.keywords.length === 0 &&
                      item.unique_keywords.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No keywords extracted
                        </p>
                      )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {analysis.story_comparison && analysis.story_comparison.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Newspaper className="h-4 w-4" />
                  Story Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {analysis.story_comparison.map((item) => (
                    <div key={item.source_id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{item.source_name}</p>
                        <Badge variant="secondary" className="text-xs">
                          {item.story_count}{' '}
                          {item.story_count === 1 ? 'story' : 'stories'}
                        </Badge>
                      </div>

                      {item.top_stories.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            Top Stories
                          </p>
                          {item.top_stories.slice(0, 5).map((story, i) => (
                            <div key={i} className="text-xs space-y-0.5">
                              <p className="leading-snug">{story.title}</p>
                              {story.keywords.length > 0 && (
                                <div className="flex flex-wrap gap-0.5">
                                  {story.keywords.map((kw) => (
                                    <Badge
                                      key={kw}
                                      variant="outline"
                                      className="text-[10px] px-1 py-0"
                                    >
                                      {kw}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {item.common_stories.length > 0 && (
                        <div>
                          <Separator className="my-1" />
                          <p className="text-xs text-muted-foreground mb-1">
                            Also covered by other sources
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {item.common_stories.map((s) => (
                              <Badge
                                key={s}
                                variant="secondary"
                                className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                              >
                                {s}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {item.exclusive_stories.length > 0 && (
                        <div>
                          <Separator className="my-1" />
                          <p className="text-xs text-muted-foreground mb-1">
                            Exclusive to this source
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {item.exclusive_stories.map((s) => (
                              <Badge
                                key={s}
                                variant="outline"
                                className="text-xs border-green-300 text-green-700 dark:border-green-700 dark:text-green-400"
                              >
                                {s}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {item.top_stories.length === 0 &&
                        item.common_stories.length === 0 &&
                        item.exclusive_stories.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            No stories detected
                          </p>
                        )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {analysis.video_comparison &&
            analysis.video_comparison.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    Video Comparison
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {analysis.video_comparison.map((item) => (
                      <div key={item.source_id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{item.source_name}</p>
                          <Badge
                            variant="secondary"
                            className={
                              item.has_video
                                ? 'text-xs bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
                                : 'text-xs'
                            }
                          >
                            {item.has_video
                              ? `${item.video_count} ${item.video_count === 1 ? 'video' : 'videos'}`
                              : 'No videos'}
                          </Badge>
                        </div>
                        {item.video_urls.length > 0 && (
                          <div className="space-y-1">
                            {item.video_urls.map((url, i) => (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-primary hover:underline truncate"
                              >
                                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{url}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Overall Verdict</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">
                {analysis.overall_verdict}
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {analysis.matched_stories && analysis.matched_stories.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Article-by-Article Comparison
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium text-foreground/80">
                Similar / matched stories
              </span>{' '}
              across sources — expand a topic to see each site&apos;s headline,
              timing, and key differences.
            </p>
          </CardHeader>
          <CardContent>
            <Accordion multiple className="w-full">
              {analysis.matched_stories.map((match, idx) => (
                <AccordionItem key={idx} value={String(idx)}>
                  <AccordionTrigger className="text-sm py-3 gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-semibold truncate">
                        {match.topic}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] flex-shrink-0"
                      >
                        {match.covered_by.length} sources
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-1">
                      <div
                        className={`grid gap-3 ${
                          match.covered_by.length === 3
                            ? 'md:grid-cols-3'
                            : 'md:grid-cols-2'
                        }`}
                      >
                        {match.covered_by.map((source) => (
                          <MatchedArticleSourceCard
                            key={source.source_id}
                            source={source}
                            snapshot={snapshotBySourceId.get(source.source_id)}
                            freshnessModifiedAt={freshnessBySourceId.get(
                              source.source_id,
                            )}
                          />
                        ))}
                      </div>

                      {match.differences && match.differences.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <ListChecks className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                            <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                              Key Differences
                            </span>
                          </div>
                          <ul className="space-y-1.5">
                            {match.differences.map((diff, i) => (
                              <li
                                key={i}
                                className="text-xs text-amber-900 dark:text-amber-200 flex gap-2"
                              >
                                <span className="text-amber-500 flex-shrink-0 mt-0.5">
                                  &bull;
                                </span>
                                <span>{diff}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          No article-by-article matches in this analysis.
        </p>
      )}
    </div>
  );
}
