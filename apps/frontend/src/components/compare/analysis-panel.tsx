/**
 * Full LLM comparison UI (freshness ranking, keywords, matched stories, etc.).
 * Used on Compare when viewing a saved analysis from history.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { Award, Newspaper, Video, ExternalLink, ArrowRightLeft, Clock, ListChecks } from 'lucide-react';
import type { ComparisonAnalysis } from '@/lib/api';

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

export function AnalysisPanel({
  analysis,
}: {
  analysis: ComparisonAnalysis;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">AI Analysis</h2>

      {/* Best for Reader callout */}
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

      {/* Freshness Ranking */}
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

      {/* Content Analysis */}
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

      {/* Keyword Analysis */}
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

      {/* Story Comparison */}
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
                      {item.story_count} {item.story_count === 1 ? 'story' : 'stories'}
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

      {/* Cross-Source Article Comparison */}
      {analysis.matched_stories && analysis.matched_stories.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Article-by-Article Comparison
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Matched stories across sources — expand to see each source&apos;s
              coverage and key differences
            </p>
          </CardHeader>
          <CardContent>
            <Accordion>
              {analysis.matched_stories.map((match, idx) => (
                <AccordionItem key={idx} value={idx}>
                  <AccordionTrigger className="text-sm py-3 gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-semibold truncate">
                        {match.topic}
                      </span>
                      <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                        {match.covered_by.length} sources
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-1">
                      {/* Source columns */}
                      <div
                        className={`grid gap-3 ${
                          match.covered_by.length === 3
                            ? 'md:grid-cols-3'
                            : 'md:grid-cols-2'
                        }`}
                      >
                        {match.covered_by.map((source) => (
                          <div
                            key={source.source_id}
                            className="rounded-lg border p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold truncate">
                                {source.source_name}
                              </span>
                              {source.filed_first ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400 flex items-center gap-0.5 flex-shrink-0"
                                >
                                  <Clock className="h-2.5 w-2.5" />
                                  Filed First
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 flex-shrink-0"
                                >
                                  Later
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              {source.title}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Differences list */}
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
                                <span className="text-amber-500 flex-shrink-0 mt-0.5">&bull;</span>
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
      )}

      {/* Video Comparison */}
      {analysis.video_comparison && analysis.video_comparison.length > 0 && (
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

      {/* Overall Verdict */}
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
    </div>
  );
}
