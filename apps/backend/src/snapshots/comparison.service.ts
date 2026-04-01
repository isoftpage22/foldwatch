import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SnapshotsService } from './snapshots.service';
import { AiProvider } from '../agent/providers/ai-provider.interface';
import { createAiProvider } from '../agent/providers/provider.factory';
import { Snapshot } from './entities/snapshot.entity';
import { ComparisonResult } from './entities/comparison-result.entity';

export interface StoryComparisonItem {
  source_name: string;
  source_id: string;
  story_count: number;
  top_stories: { title: string; keywords: string[] }[];
  common_stories: string[];
  exclusive_stories: string[];
}

export interface VideoComparisonItem {
  source_name: string;
  source_id: string;
  video_count: number;
  video_urls: string[];
  has_video: boolean;
}

export interface MatchedStory {
  topic: string;
  covered_by: {
    source_name: string;
    source_id: string;
    title: string;
    filed_first: boolean;
  }[];
  differences: string[];
}

export interface ComparisonAnalysis {
  freshness_ranking: {
    source_name: string;
    source_id: string;
    modified_at: string | null;
    freshness_score: number | null;
    posted_first: boolean;
  }[];
  content_analysis: {
    source_name: string;
    source_id: string;
    readability: 'high' | 'medium' | 'low';
    detail_level: number;
    strengths: string[];
    weaknesses: string[];
  }[];
  keyword_analysis: {
    source_name: string;
    source_id: string;
    keywords: string[];
    unique_keywords: string[];
  }[];
  story_comparison: StoryComparisonItem[];
  matched_stories: MatchedStory[];
  video_comparison: VideoComparisonItem[];
  overall_verdict: string;
  best_for_reader: {
    source_name: string;
    source_id: string;
    reason: string;
  };
}

@Injectable()
export class ComparisonService {
  private readonly logger = new Logger(ComparisonService.name);
  private readonly aiProvider: AiProvider;

  constructor(
    private readonly config: ConfigService,
    private readonly snapshotsService: SnapshotsService,
    @InjectRepository(ComparisonResult)
    private readonly comparisonRepo: Repository<ComparisonResult>,
  ) {
    this.aiProvider = createAiProvider(this.config);
  }

  async analyze(
    sourceIds: string[],
  ): Promise<{ analysis: ComparisonAnalysis; record_id: string }> {
    if (sourceIds.length < 2 || sourceIds.length > 3) {
      throw new BadRequestException('Select 2 or 3 sources to compare');
    }

    const snapshots =
      await this.snapshotsService.getLatestForSources(sourceIds);

    if (snapshots.length < 2) {
      throw new BadRequestException(
        'At least 2 sources must have snapshots to compare',
      );
    }

    const prompt = await this.buildPrompt(snapshots);

    const response = await this.aiProvider.startConversation(
      this.systemPrompt(),
      prompt,
      [],
    );

    const analysis = this.parseResponse(response.textContent, snapshots);

    const record = this.comparisonRepo.create({
      source_ids: snapshots.map((s) => s.source_id),
      source_names: snapshots.map((s) => s.source?.name || 'Unknown'),
      analysis: analysis as unknown as object,
    });
    const saved = await this.comparisonRepo.save(record);

    this.logger.log(`Comparison ${saved.id} saved for ${snapshots.length} sources`);

    return { analysis, record_id: saved.id };
  }

  async getHistory(
    page = 1,
    limit = 20,
  ): Promise<{ data: ComparisonResult[]; total: number }> {
    const [data, total] = await this.comparisonRepo.findAndCount({
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      select: ['id', 'source_ids', 'source_names', 'created_at'],
    });
    return { data, total };
  }

  async findOne(id: string): Promise<ComparisonResult> {
    const record = await this.comparisonRepo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Comparison result ${id} not found`);
    }
    return record;
  }

  private systemPrompt(): string {
    return `You are a news intelligence analyst for FoldWatch. You compare first-fold content across news sources.
You MUST respond with ONLY valid JSON matching the exact schema below. No markdown, no code fences, no explanation outside the JSON.

Response schema:
{
  "freshness_ranking": [{ "source_name": "", "source_id": "", "modified_at": "", "freshness_score": 0, "posted_first": true }],
  "content_analysis": [{ "source_name": "", "source_id": "", "readability": "high"|"medium"|"low", "detail_level": 1-10, "strengths": ["..."], "weaknesses": ["..."] }],
  "keyword_analysis": [{ "source_name": "", "source_id": "", "keywords": ["..."], "unique_keywords": ["..."] }],
  "story_comparison": [{ "source_name": "", "source_id": "", "story_count": 0, "top_stories": [{ "title": "...", "keywords": ["..."] }], "common_stories": ["titles appearing in multiple sources"], "exclusive_stories": ["titles only this source covers"] }],
  "matched_stories": [{ "topic": "short normalized topic name", "covered_by": [{ "source_name": "", "source_id": "", "title": "exact title from that source", "filed_first": true }], "differences": ["how each source's coverage differs — angle, depth, framing, detail, tone, etc."] }],
  "video_comparison": [{ "source_name": "", "source_id": "", "video_count": 0, "video_urls": ["..."], "has_video": true }],
  "overall_verdict": "A paragraph summarizing the comparison and who covers the story best",
  "best_for_reader": { "source_name": "", "source_id": "", "reason": "Why this source is best for the reader" }
}

IMPORTANT rules for matched_stories:
- Match stories across sources by comparing their TITLE TEXT directly (e.g. "PM Modi visits France" and "Modi's France trip" cover the same event because the titles share key words).
- Do NOT match by broad category or keyword only. Two stories must be about the SAME specific event/news to be matched.
- Each entry in matched_stories represents ONE news topic/event that appears in 2+ sources.
- For each matched story, set filed_first=true for the source that published/covered it first (based on the source's modified_at timestamp or page freshness). Only ONE source per matched story should have filed_first=true.
- Include ALL cross-source matches you can find. Even partial title overlaps count if they refer to the same event.
- For each matched story, provide a "differences" array listing 2-5 specific differences in how the sources cover the same story. Compare: headline angle/framing, level of detail, tone (neutral vs sensational), what facts are included/omitted, use of quotes, and any unique perspective each source brings.

IMPORTANT rules for story_comparison:
- Use ONLY the stories provided in each source's stories array. Do NOT invent or re-count stories.
- story_count MUST equal the length of the stories array provided for that source.`;
  }

  private async buildPrompt(snapshots: Snapshot[]): Promise<string> {
    const sourceIds = snapshots.map((s) => s.source_id);
    const [velocity, foldSummary] = await Promise.all([
      this.snapshotsService.getPublishingVelocity(sourceIds, {
        windowHours: 168,
        limit: 40,
      }),
      this.snapshotsService.getFoldSummary(sourceIds),
    ]);

    const sources = snapshots.map((s) => {
      const stories = Array.isArray(s.stories) ? s.stories : [];
      return {
        source_id: s.source_id,
        source_name: s.source?.name || 'Unknown',
        source_url: s.source?.url || '',
        crawl_interval_minutes: s.source?.crawl_interval_minutes ?? 30,
        headline: s.headline,
        summary: s.summary,
        hero_image_url: s.hero_image_url,
        published_at: s.published_at?.toISOString() || null,
        modified_at: s.modified_at?.toISOString() || null,
        freshness_score: s.freshness_score,
        date_source: s.date_source,
        new_since_last_crawl_count: Array.isArray(s.new_stories)
          ? s.new_stories.length
          : 0,
        stories: stories.map((st: Record<string, unknown>) => ({
          title: st.title,
          url: st.url,
          keywords: st.keywords,
          first_seen_at: st.first_seen_at ?? null,
          is_new_since_last_crawl: Boolean(st.is_new_since_last_crawl),
        })),
        video_urls: Array.isArray(s.video_urls) ? s.video_urls : [],
      };
    });

    return `Compare these ${sources.length} news sources' first-fold content. Analyze freshness (who published first), content quality, readability, detail level, strengths/weaknesses, and keywords.

Fold batch & tenure (use this in your analysis):
- Each story may include first_seen_at (when we first saw it on this source's fold) and is_new_since_last_crawl
- new_since_last_crawl_count is how many stories are new vs the previous crawl for that source
- fold_summary (sticky stories, counts): ${JSON.stringify(foldSummary)}
- publishing_velocity (last ${velocity.window_hours}h, normalized by crawl interval — prefer estimated_new_per_hour when comparing cadence): ${JSON.stringify(velocity)}
- When comparing "who publishes more new fold stories", account for different crawl_interval_minutes and use normalized metrics where possible; call out raw totals vs normalized interpretation

Also compare the number and content of stories on each source's first fold:
- Use ONLY the stories array provided for each source — do NOT re-count or add stories
- story_count must match the array length
- For each story, note the title and 2-5 keywords, and comment on tenure (new vs long-running on the fold) where notable
- Identify common stories (by comparing title TEXT across sources) and exclusive stories

CRITICAL — Cross-source story matching (matched_stories):
- Compare story TITLES directly across sources to find stories about the same specific event
- Match when two titles share significant words or describe the same event (e.g. "Jadeja joins RR" and "CSK release Jadeja to Rajasthan Royals" = same event)
- Do NOT match broad categories (e.g. "Cricket" with "IPL" unless they're about the same specific match/event)
- For each matched topic, list which sources covered it and their exact titles
- Determine which source filed/published each story FIRST based on the source's modified_at timestamp (earlier = filed first). Mark that source with filed_first=true
- For each matched story, list 2-5 specific differences in how the sources cover it (angle, depth, tone, facts, framing)

Also compare video content:
- Count video URLs per source
- Note which sources feature video content

Determine which source is best for readers.

${JSON.stringify(sources, null, 2)}`;
  }

  private parseResponse(
    text: string,
    snapshots: Snapshot[],
  ): ComparisonAnalysis {
    try {
      const cleaned = text
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed.story_comparison) {
        parsed.story_comparison = this.fallbackStoryComparison(snapshots);
      }
      const textMatches = this.computeMatchedStoriesFromTitles(snapshots);
      if (
        !parsed.matched_stories ||
        !Array.isArray(parsed.matched_stories) ||
        parsed.matched_stories.length === 0
      ) {
        parsed.matched_stories = textMatches;
      } else {
        parsed.matched_stories = this.mergeMatchedStories(
          parsed.matched_stories,
          textMatches,
        );
        for (const ms of parsed.matched_stories) {
          if (!ms.differences) ms.differences = [];
        }
      }
      if (!parsed.video_comparison) {
        parsed.video_comparison = this.fallbackVideoComparison(snapshots);
      }
      return parsed as ComparisonAnalysis;
    } catch {
      this.logger.warn('AI returned non-JSON; building fallback analysis');
      return this.fallbackAnalysis(snapshots, text);
    }
  }

  private fallbackStoryComparison(snapshots: Snapshot[]): StoryComparisonItem[] {
    return snapshots.map((s) => {
      const stories = Array.isArray(s.stories) ? s.stories : [];
      return {
        source_name: s.source?.name || 'Unknown',
        source_id: s.source_id,
        story_count: stories.length,
        top_stories: stories.slice(0, 5).map((st) => ({
          title: st.title,
          keywords: Array.isArray(st.keywords) ? st.keywords : [],
        })),
        common_stories: [],
        exclusive_stories: [],
      };
    });
  }

  private fallbackVideoComparison(snapshots: Snapshot[]): VideoComparisonItem[] {
    return snapshots.map((s) => {
      const videos = Array.isArray(s.video_urls) ? s.video_urls : [];
      return {
        source_name: s.source?.name || 'Unknown',
        source_id: s.source_id,
        video_count: videos.length,
        video_urls: videos,
        has_video: videos.length > 0,
      };
    });
  }

  private fallbackAnalysis(
    snapshots: Snapshot[],
    rawText: string,
  ): ComparisonAnalysis {
    const sorted = [...snapshots].sort(
      (a, b) =>
        new Date(a.modified_at || 0).getTime() -
        new Date(b.modified_at || 0).getTime(),
    );

    const firstId = sorted[0]?.source_id;

    return {
      freshness_ranking: sorted.map((s) => ({
        source_name: s.source?.name || 'Unknown',
        source_id: s.source_id,
        modified_at: s.modified_at?.toISOString() || null,
        freshness_score: s.freshness_score,
        posted_first: s.source_id === firstId,
      })),
      content_analysis: snapshots.map((s) => ({
        source_name: s.source?.name || 'Unknown',
        source_id: s.source_id,
        readability: 'medium' as const,
        detail_level: 5,
        strengths: ['Content available'],
        weaknesses: ['AI analysis unavailable'],
      })),
      keyword_analysis: snapshots.map((s) => ({
        source_name: s.source?.name || 'Unknown',
        source_id: s.source_id,
        keywords: [],
        unique_keywords: [],
      })),
      story_comparison: this.fallbackStoryComparison(snapshots),
      matched_stories: this.computeMatchedStoriesFromTitles(snapshots),
      video_comparison: this.fallbackVideoComparison(snapshots),
      overall_verdict: rawText || 'Analysis could not be completed.',
      best_for_reader: {
        source_name: sorted[0]?.source?.name || 'Unknown',
        source_id: sorted[0]?.source_id || '',
        reason: 'Published first (fallback — AI analysis unavailable)',
      },
    };
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  }

  private titleSimilarity(a: string, b: string): number {
    const tokensA = this.tokenize(a);
    const tokensB = this.tokenize(b);
    if (tokensA.size === 0 || tokensB.size === 0) return 0;
    let overlap = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) overlap++;
    }
    return overlap / Math.min(tokensA.size, tokensB.size);
  }

  private computeMatchedStoriesFromTitles(
    snapshots: Snapshot[],
  ): MatchedStory[] {
    const SIMILARITY_THRESHOLD = 0.4;

    const sourceStories = snapshots.map((s) => ({
      source_id: s.source_id,
      source_name: s.source?.name || 'Unknown',
      modified_at: s.modified_at ? new Date(s.modified_at).getTime() : Infinity,
      stories: (Array.isArray(s.stories) ? s.stories : []).map((st) => st.title),
    }));

    if (sourceStories.length < 2) return [];

    const matched: MatchedStory[] = [];
    const usedPairs = new Set<string>();

    for (let i = 0; i < sourceStories.length; i++) {
      for (const titleA of sourceStories[i].stories) {
        for (let j = i + 1; j < sourceStories.length; j++) {
          for (const titleB of sourceStories[j].stories) {
            const pairKey = `${i}:${titleA}||${j}:${titleB}`;
            if (usedPairs.has(pairKey)) continue;

            const sim = this.titleSimilarity(titleA, titleB);
            if (sim < SIMILARITY_THRESHOLD) continue;

            usedPairs.add(pairKey);

            const srcA = sourceStories[i];
            const srcB = sourceStories[j];
            const aFirst = srcA.modified_at <= srcB.modified_at;

            const topic =
              titleA.length <= titleB.length
                ? titleA.substring(0, 80)
                : titleB.substring(0, 80);

            matched.push({
              topic,
              covered_by: [
                {
                  source_name: srcA.source_name,
                  source_id: srcA.source_id,
                  title: titleA,
                  filed_first: aFirst,
                },
                {
                  source_name: srcB.source_name,
                  source_id: srcB.source_id,
                  title: titleB,
                  filed_first: !aFirst,
                },
              ],
              differences: [],
            });
          }
        }
      }
    }

    return matched;
  }

  private mergeMatchedStories(
    aiMatches: MatchedStory[],
    textMatches: MatchedStory[],
  ): MatchedStory[] {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const keyOf = (m: MatchedStory) => {
      const ids = [...new Set(m.covered_by.map((c) => c.source_id))]
        .sort()
        .join('|');
      return `${normalize(m.topic)}::${ids}`;
    };

    const merged = new Map<string, MatchedStory>();
    for (const m of aiMatches) {
      merged.set(keyOf(m), m);
    }
    for (const m of textMatches) {
      const k = keyOf(m);
      if (!merged.has(k)) {
        merged.set(k, m);
      }
    }
    return [...merged.values()];
  }
}
