import { createHash, randomUUID } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual, LessThan } from 'typeorm';
import { Snapshot } from './entities/snapshot.entity';
import { StoryFoldPresence } from './entities/story-fold-presence.entity';

export type StoryItem = {
  title: string;
  url?: string;
  keywords?: string[];
  source_updated_at?: string;
  source_updated_source?: string;
  source_time_available?: boolean;
};

export type StoryItemWithTenure = StoryItem & {
  first_seen_at?: string;
  is_new_since_last_crawl?: boolean;
};

export interface CreateSnapshotInput {
  source_id: string;
  headline?: string;
  summary?: string;
  hero_image_url?: string;
  published_at?: string;
  modified_at?: string;
  date_source?: string;
  freshness_score: number;
  stories?: StoryItem[];
  video_urls?: string[];
  raw_meta?: object;
  extraction_failed?: boolean;
}

export interface FoldSummaryRow {
  source_id: string;
  source_name: string;
  story_count: number;
  new_count: number;
  sticky_over_24h: number;
  stories: StoryItemWithTenure[];
}

export interface PublishingVelocitySeriesPoint {
  at: string;
  new_count: number;
}

export interface PublishingVelocitySourceMetrics {
  source_id: string;
  source_name: string;
  crawl_interval_minutes: number;
  series: PublishingVelocitySeriesPoint[];
  total_new_in_window: number;
  crawl_count_in_window: number;
  avg_new_per_crawl: number;
  estimated_new_per_hour: number;
}

export interface PublishingVelocityResponse {
  window_hours: number;
  limit: number;
  sources: PublishingVelocitySourceMetrics[];
  head_to_head?: {
    source_a_id: string;
    source_b_id: string;
    total_new_a: number;
    total_new_b: number;
    avg_new_per_crawl_a: number;
    avg_new_per_crawl_b: number;
    estimated_new_per_hour_a: number;
    estimated_new_per_hour_b: number;
    faster_by_estimated_hourly_rate: string | null;
  };
}

export interface SourceAnalyticsChurnPoint {
  at: string;
  total_stories: number;
  new_count: number;
  removed_count: number;
}

export interface SourceAnalyticsFreshnessPoint {
  at: string;
  score: number;
}

export interface SourceAnalyticsSourceMetrics {
  source_id: string;
  source_name: string;
  avg_tenure_minutes: number;
  median_tenure_minutes: number;
  total_stories_tracked: number;
  tenure_label: string;
  churn_series: SourceAnalyticsChurnPoint[];
  avg_new_per_crawl: number;
  avg_removed_per_crawl: number;
  churn_rate: number;
  freshness_series: SourceAnalyticsFreshnessPoint[];
  avg_freshness: number;
  update_count: number;
  fold_updates_per_day: number;
}

export interface SourceAnalyticsResponse {
  window_hours: number | null;
  sources: SourceAnalyticsSourceMetrics[];
}

/** Story first seen in a time window (enriched from latest snapshot when possible). */
export interface StoryInWindowRow {
  story_key: string;
  title: string;
  url?: string;
  first_seen_at: string;
}

export interface StoriesInWindowSourceRow {
  source_id: string;
  source_name: string;
  stories_on_fold: number;
  new_in_window: number;
  stories: StoryInWindowRow[];
}

export interface StoriesInWindowResponse {
  window_minutes: number;
  sources: StoriesInWindowSourceRow[];
}

function medianSorted(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatTenureLabel(avgMinutes: number): string {
  if (!Number.isFinite(avgMinutes) || avgMinutes <= 0) {
    return '—';
  }
  if (avgMinutes < 60) {
    return `${Math.round(avgMinutes)}m / story`;
  }
  const h = Math.floor(avgMinutes / 60);
  const m = Math.round(avgMinutes % 60);
  return m > 0 ? `${h}h ${m}m / story` : `${h}h / story`;
}

@Injectable()
export class SnapshotsService implements OnModuleInit {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(
    @InjectRepository(Snapshot)
    private readonly repo: Repository<Snapshot>,
    @InjectRepository(StoryFoldPresence)
    private readonly presenceRepo: Repository<StoryFoldPresence>,
  ) {}

  onModuleInit() {
    this.logger.log('SnapshotsService initialized');
  }

  private recomputeFreshness(snapshot: Snapshot): Snapshot {
    if (snapshot.modified_at) {
      const hoursAgo =
        (Date.now() - new Date(snapshot.modified_at).getTime()) / 3_600_000;
      snapshot.freshness_score =
        Math.round((1 / (1 + hoursAgo)) * 10000) / 10000;
    }
    return snapshot;
  }

  private static readonly MAX_STORIES = 30;

  /** Stable key per story for diff + presence (normalized URL or title fallback). */
  storyKey(story: StoryItem): string {
    const u = story.url?.trim();
    if (u) {
      try {
        const parsed = new URL(u);
        return parsed.href.split('#')[0].toLowerCase();
      } catch {
        return u.toLowerCase();
      }
    }
    return `title:${story.title.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  }

  /** DB row id for story_fold_presence (fixed length for MySQL index limits). */
  private storyPresenceDbKey(story: StoryItem): string {
    return createHash('sha256').update(this.storyKey(story), 'utf8').digest('hex');
  }

  private buildPreviousKeySet(
    prevStories: StoryItem[] | null | undefined,
  ): Set<string> {
    const set = new Set<string>();
    if (!Array.isArray(prevStories)) return set;
    for (const s of prevStories) {
      set.add(this.storyKey(s));
    }
    return set;
  }

  private computeNewStories(
    prevStories: StoryItem[] | null | undefined,
    current: StoryItem[] | null,
  ): StoryItem[] | null {
    if (!current?.length) return current;
    const prevKeys = this.buildPreviousKeySet(prevStories);
    if (prevKeys.size === 0) {
      return [...current];
    }
    return current.filter((s) => !prevKeys.has(this.storyKey(s)));
  }

  /**
   * Same fold often repeats links/titles; they map to one presence row.
   * Without deduping, `save()` issued two INSERTs for the same (source_id, story_key).
   */
  private dedupeStoriesByPresenceKey(stories: StoryItem[]): StoryItem[] {
    const map = new Map<string, StoryItem>();
    for (const s of stories) {
      const k = this.storyPresenceDbKey(s);
      if (!map.has(k)) {
        map.set(k, s);
      }
    }
    return [...map.values()];
  }

  private async upsertPresenceForStories(
    sourceId: string,
    stories: StoryItem[],
    crawlTime: Date,
  ): Promise<void> {
    const unique = this.dedupeStoriesByPresenceKey(stories);
    if (!unique.length) return;

    await this.presenceRepo
      .createQueryBuilder()
      .insert()
      .into(StoryFoldPresence)
      .values(
        unique.map((s) => ({
          id: randomUUID(),
          source_id: sourceId,
          story_key: this.storyPresenceDbKey(s),
          first_seen_at: crawlTime,
          last_seen_at: crawlTime,
          created_at: crawlTime,
        })),
      )
      .orUpdate(['last_seen_at'], ['source_id', 'story_key'])
      .execute();
  }

  /**
   * Attach first_seen_at and is_new_since_last_crawl to story objects (read path).
   */
  async attachTenureToSnapshot(snapshot: Snapshot): Promise<Snapshot> {
    const stories = Array.isArray(snapshot.stories) ? snapshot.stories : [];
    const newStories = Array.isArray(snapshot.new_stories)
      ? snapshot.new_stories
      : [];
    if (stories.length === 0) {
      return snapshot;
    }
    const dbKeys = stories.map((s) => this.storyPresenceDbKey(s));
    const newKeySet = new Set(newStories.map((s) => this.storyKey(s)));
    const rows = await this.presenceRepo.find({
      where: {
        source_id: snapshot.source_id,
        story_key: In(dbKeys),
      },
    });
    const firstSeenByDigest = new Map(
      rows.map((r) => [r.story_key, r.first_seen_at.toISOString()]),
    );
    const enrichedStories: StoryItemWithTenure[] = stories.map((s) => {
      const canonical = this.storyKey(s);
      const digest = this.storyPresenceDbKey(s);
      return {
        ...s,
        first_seen_at: firstSeenByDigest.get(digest),
        is_new_since_last_crawl: newKeySet.has(canonical),
      };
    });
    const enrichedNew: StoryItemWithTenure[] = newStories.map((s) => {
      const digest = this.storyPresenceDbKey(s);
      return {
        ...s,
        first_seen_at: firstSeenByDigest.get(digest),
        is_new_since_last_crawl: true,
      };
    });
    const clone = Object.assign(new Snapshot(), snapshot);
    clone.stories = enrichedStories;
    clone.new_stories = enrichedNew.length ? enrichedNew : snapshot.new_stories;
    return this.recomputeFreshness(clone);
  }

  async create(input: CreateSnapshotInput): Promise<Snapshot> {
    const prev = await this.repo.findOne({
      where: { source_id: input.source_id },
      order: { created_at: 'DESC' },
    });

    const now = new Date();
    const modifiedAt = input.modified_at ? new Date(input.modified_at) : now;
    const stories = Array.isArray(input.stories)
      ? input.stories.slice(0, SnapshotsService.MAX_STORIES)
      : null;

    const new_stories = stories?.length
      ? this.computeNewStories(prev?.stories, stories)
      : null;

    const hoursAgo = (now.getTime() - modifiedAt.getTime()) / 3_600_000;
    const freshness =
      Math.round((1 / (1 + Math.max(0, hoursAgo))) * 10000) / 10000;

    const snapshot = this.repo.create({
      source_id: input.source_id,
      headline: input.headline || null,
      summary: input.summary || null,
      hero_image_url: input.hero_image_url || null,
      published_at: input.published_at ? new Date(input.published_at) : null,
      modified_at: modifiedAt,
      date_source: input.date_source || 'crawl_time',
      freshness_score: freshness,
      stories,
      new_stories,
      video_urls: Array.isArray(input.video_urls) ? input.video_urls : null,
      raw_meta: input.raw_meta || null,
      extraction_failed: input.extraction_failed || false,
    });

    if (stories && stories.length < (input.stories?.length || 0)) {
      this.logger.warn(
        `Capped stories for source ${input.source_id}: ${input.stories!.length} → ${stories.length}`,
      );
    }

    const saved = await this.repo.save(snapshot);
    if (stories?.length) {
      await this.upsertPresenceForStories(
        input.source_id,
        stories,
        saved.created_at,
      );
    }
    return saved;
  }

  async getCompare(): Promise<Snapshot[]> {
    /**
     * Latest snapshot per source: use a scalar subquery (ORDER BY + LIMIT 1).
     * The old MAX(created_at) + equality join can miss the newest row in MySQL
     * (timestamp precision / driver coercion), so Compare showed stale `created_at`
     * even after new crawls.
     */
    const table = this.repo.metadata.tableName;
    const snapshots = await this.repo
      .createQueryBuilder('snapshot')
      .leftJoinAndSelect('snapshot.source', 'source')
      .where(
        `snapshot.id = (
          SELECT s2.id FROM \`${table}\` s2
          WHERE s2.source_id = snapshot.source_id
          ORDER BY s2.created_at DESC, s2.id DESC
          LIMIT 1
        )`,
      )
      .getMany();

    const sorted = snapshots
      .map((s) => this.recomputeFreshness(s))
      .sort((a, b) => (b.freshness_score || 0) - (a.freshness_score || 0));

    return Promise.all(sorted.map((s) => this.attachTenureToSnapshot(s)));
  }

  async getHistory(
    sourceId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Snapshot[]; total: number }> {
    const [data, total] = await this.repo.findAndCount({
      where: { source_id: sourceId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data.map((s) => this.recomputeFreshness(s)),
      total,
    };
  }

  async getLatestForSource(sourceId: string): Promise<Snapshot | null> {
    const snapshot = await this.repo.findOne({
      where: { source_id: sourceId },
      order: { created_at: 'DESC' },
    });
    return snapshot ? this.recomputeFreshness(snapshot) : null;
  }

  async getLatestForSources(sourceIds: string[]): Promise<Snapshot[]> {
    const all = await this.getCompare();
    return all.filter((s) => sourceIds.includes(s.source_id));
  }

  async getFoldSummary(sourceIds: string[]): Promise<FoldSummaryRow[]> {
    if (!sourceIds.length) return [];
    const snapshots = await this.getLatestForSources(sourceIds);
    const asOf = Date.now();
    const dayMs = 24 * 3600_000;
    return snapshots.map((snap) => {
      const stories = (snap.stories || []) as StoryItemWithTenure[];
      const newCount = Array.isArray(snap.new_stories)
        ? snap.new_stories.length
        : 0;
      let sticky = 0;
      for (const st of stories) {
        if (st.first_seen_at) {
          if (asOf - new Date(st.first_seen_at).getTime() >= dayMs) {
            sticky += 1;
          }
        }
      }
      return {
        source_id: snap.source_id,
        source_name: snap.source?.name || 'Unknown',
        story_count: stories.length,
        new_count: newCount,
        sticky_over_24h: sticky,
        stories,
      };
    });
  }

  async getPublishingVelocity(
    sourceIds: string[],
    opts?: { windowHours?: number; limit?: number },
  ): Promise<PublishingVelocityResponse> {
    const windowHours = opts?.windowHours ?? 168;
    const limit = opts?.limit ?? 50;
    if (sourceIds.length === 0) {
      return { window_hours: windowHours, limit, sources: [] };
    }
    const since = new Date(Date.now() - windowHours * 3600_000);

    const sources: PublishingVelocitySourceMetrics[] = [];

    for (const sid of sourceIds) {
      const rows = await this.repo.find({
        where: { source_id: sid, created_at: MoreThanOrEqual(since) },
        order: { created_at: 'DESC' },
        take: limit,
        relations: ['source'],
      });
      const chronological = [...rows].reverse();
      const series: PublishingVelocitySeriesPoint[] = chronological.map(
        (r) => ({
          at: r.created_at.toISOString(),
          new_count: Array.isArray(r.new_stories) ? r.new_stories.length : 0,
        }),
      );
      const totalNew = series.reduce((a, p) => a + p.new_count, 0);
      const crawlCount = series.length;
      const avgNewPerCrawl = crawlCount ? totalNew / crawlCount : 0;
      const intervalMin = rows[0]?.source?.crawl_interval_minutes ?? 30;
      const safeInterval = [5, 15, 30].includes(intervalMin) ? intervalMin : 15;
      const estimatedNewPerHour =
        safeInterval > 0 ? (avgNewPerCrawl * 60) / safeInterval : 0;

      sources.push({
        source_id: sid,
        source_name: rows[0]?.source?.name || 'Unknown',
        crawl_interval_minutes: safeInterval,
        series,
        total_new_in_window: totalNew,
        crawl_count_in_window: crawlCount,
        avg_new_per_crawl: Math.round(avgNewPerCrawl * 1000) / 1000,
        estimated_new_per_hour: Math.round(estimatedNewPerHour * 1000) / 1000,
      });
    }

    let head_to_head: PublishingVelocityResponse['head_to_head'];
    if (sourceIds.length === 2) {
      const [a, b] = sources;
      const fa = a.estimated_new_per_hour;
      const fb = b.estimated_new_per_hour;
      let faster: string | null = null;
      if (fa > fb * 1.05) faster = a.source_id;
      else if (fb > fa * 1.05) faster = b.source_id;
      head_to_head = {
        source_a_id: a.source_id,
        source_b_id: b.source_id,
        total_new_a: a.total_new_in_window,
        total_new_b: b.total_new_in_window,
        avg_new_per_crawl_a: a.avg_new_per_crawl,
        avg_new_per_crawl_b: b.avg_new_per_crawl,
        estimated_new_per_hour_a: a.estimated_new_per_hour,
        estimated_new_per_hour_b: b.estimated_new_per_hour,
        faster_by_estimated_hourly_rate: faster,
      };
    }

    return { window_hours: windowHours, limit, sources, head_to_head };
  }

  async getAverageFreshness(): Promise<{
    avg: number;
    freshest: Snapshot | null;
    stalest: Snapshot | null;
  }> {
    const compare = await this.getCompare();
    if (compare.length === 0) {
      return { avg: 0, freshest: null, stalest: null };
    }
    const scores = compare.map((s) => s.freshness_score || 0);
    const avg =
      Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10000) /
      10000;
    return {
      avg,
      freshest: compare[0] || null,
      stalest: compare[compare.length - 1] || null,
    };
  }

  /**
   * Per-source tenure (story_fold_presence), churn (consecutive snapshot diffs),
   * and freshness time series for analytics UI.
   */
  async getSourceAnalytics(
    sourceIds: string[],
    windowHours?: number | null,
  ): Promise<SourceAnalyticsResponse> {
    if (!sourceIds.length) {
      return { window_hours: windowHours ?? null, sources: [] };
    }

    const hasWindow =
      windowHours != null && windowHours > 0 && Number.isFinite(windowHours);
    const windowStart = hasWindow
      ? new Date(Date.now() - windowHours! * 3600_000)
      : null;
    const windowHoursOut: number | null = hasWindow ? windowHours! : null;

    const presenceRows = await this.presenceRepo.find({
      where: {
        source_id: In(sourceIds),
        ...(windowStart
          ? { first_seen_at: MoreThanOrEqual(windowStart) }
          : {}),
      },
    });

    const tenureBySource = new Map<
      string,
      { minutes: number[]; name: string }
    >();
    for (const sid of sourceIds) {
      tenureBySource.set(sid, { minutes: [], name: 'Unknown' });
    }
    for (const row of presenceRows) {
      const bucket = tenureBySource.get(row.source_id);
      if (!bucket) continue;
      const ms =
        row.last_seen_at.getTime() - row.first_seen_at.getTime();
      if (ms >= 0) {
        bucket.minutes.push(ms / 60_000);
      }
    }

    const MAX_SNAPSHOTS = 2000;
    const sources: SourceAnalyticsSourceMetrics[] = [];

    for (const sid of sourceIds) {
      const beforeWindow = windowStart
        ? await this.repo.findOne({
            where: { source_id: sid, created_at: LessThan(windowStart) },
            order: { created_at: 'DESC' },
            relations: ['source'],
          })
        : null;

      const rows = await this.repo.find({
        where: {
          source_id: sid,
          ...(windowStart
            ? { created_at: MoreThanOrEqual(windowStart) }
            : {}),
        },
        order: { created_at: 'ASC' },
        take: MAX_SNAPSHOTS,
        relations: ['source'],
      });

      const sourceName =
        rows[0]?.source?.name ||
        beforeWindow?.source?.name ||
        'Unknown';

      const tBucket = tenureBySource.get(sid)!;
      tBucket.name = sourceName;
      const tenures = tBucket.minutes.slice().sort((a, b) => a - b);
      const avgTen =
        tenures.length > 0
          ? tenures.reduce((a, b) => a + b, 0) / tenures.length
          : 0;
      const medTen = medianSorted(tenures);

      const chain: Snapshot[] = [];
      if (beforeWindow) chain.push(beforeWindow);
      chain.push(...rows);

      const churnSeries: SourceAnalyticsChurnPoint[] = [];
      let prev: Snapshot | null = null;
      for (const curr of chain) {
        if (!prev) {
          prev = curr;
          continue;
        }
        const prevStories = Array.isArray(prev.stories) ? prev.stories : [];
        const currStories = Array.isArray(curr.stories) ? curr.stories : [];
        const prevKeys = new Set(prevStories.map((s) => this.storyKey(s)));
        const currKeys = new Set(currStories.map((s) => this.storyKey(s)));
        let removed = 0;
        for (const k of prevKeys) {
          if (!currKeys.has(k)) removed += 1;
        }
        const newCount = Array.isArray(curr.new_stories)
          ? curr.new_stories.length
          : 0;
        if (curr.created_at >= (windowStart ?? new Date(0))) {
          churnSeries.push({
            at: curr.created_at.toISOString(),
            total_stories: currStories.length,
            new_count: newCount,
            removed_count: removed,
          });
        }
        prev = curr;
      }

      const nPoints = churnSeries.length;
      const avgNew = nPoints
        ? churnSeries.reduce((a, p) => a + p.new_count, 0) / nPoints
        : 0;
      const avgRem = nPoints
        ? churnSeries.reduce((a, p) => a + p.removed_count, 0) / nPoints
        : 0;
      let churnRateSum = 0;
      let churnRateN = 0;
      for (const p of churnSeries) {
        const denom = Math.max(1, p.total_stories);
        churnRateSum += (p.new_count + p.removed_count) / denom;
        churnRateN += 1;
      }
      const churnRate =
        churnRateN > 0 ? churnRateSum / churnRateN : 0;

      const freshnessSeries: SourceAnalyticsFreshnessPoint[] = rows.map(
        (r) => {
          const s = this.recomputeFreshness(
            Object.assign(new Snapshot(), r),
          );
          return {
            at: r.created_at.toISOString(),
            score: s.freshness_score ?? 0,
          };
        },
      );
      const scores = freshnessSeries.map((f) => f.score);
      const avgFresh =
        scores.length > 0
          ? Math.round(
              (scores.reduce((a, b) => a + b, 0) / scores.length) * 10000,
            ) / 10000
          : 0;

      const updateCount = rows.length;
      let spanMs = 1;
      if (rows.length >= 2) {
        spanMs =
          rows[rows.length - 1].created_at.getTime() -
          rows[0].created_at.getTime();
      } else if (hasWindow && windowStart) {
        spanMs = Date.now() - windowStart.getTime();
      } else if (rows.length === 1) {
        spanMs = 24 * 3600_000;
      }
      const spanDays = Math.max(spanMs / (24 * 3600_000), 1 / 24);
      const foldUpdatesPerDay = updateCount / spanDays;

      sources.push({
        source_id: sid,
        source_name: sourceName,
        avg_tenure_minutes: Math.round(avgTen * 1000) / 1000,
        median_tenure_minutes: Math.round(medTen * 1000) / 1000,
        total_stories_tracked: tenures.length,
        tenure_label: formatTenureLabel(avgTen),
        churn_series: churnSeries,
        avg_new_per_crawl: Math.round(avgNew * 1000) / 1000,
        avg_removed_per_crawl: Math.round(avgRem * 1000) / 1000,
        churn_rate: Math.round(churnRate * 10000) / 10000,
        freshness_series: freshnessSeries,
        avg_freshness: avgFresh,
        update_count: updateCount,
        fold_updates_per_day:
          Math.round(foldUpdatesPerDay * 1000) / 1000,
      });
    }

    return { window_hours: windowHoursOut, sources };
  }

  /**
   * Stories whose presence row has first_seen_at within the last `windowMinutes`
   * (global clock), per source. Titles/URLs come from the latest snapshot when
   * the story is still on the fold; otherwise a placeholder title is used.
   */
  async getStoriesInWindow(
    sourceIds: string[],
    windowMinutes: number,
  ): Promise<StoriesInWindowResponse> {
    const ids = [...new Set(sourceIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0 || !Number.isFinite(windowMinutes) || windowMinutes <= 0) {
      return { window_minutes: windowMinutes, sources: [] };
    }

    const windowStart = new Date(Date.now() - windowMinutes * 60_000);
    const presenceRows = await this.presenceRepo.find({
      where: {
        source_id: In(ids),
        first_seen_at: MoreThanOrEqual(windowStart),
      },
      order: { first_seen_at: 'DESC' },
    });

    const table = this.repo.metadata.tableName;
    const latestSnaps = await this.repo
      .createQueryBuilder('snapshot')
      .leftJoinAndSelect('snapshot.source', 'source')
      .where('snapshot.source_id IN (:...ids)', { ids })
      .andWhere(
        `snapshot.id = (
          SELECT s2.id FROM \`${table}\` s2
          WHERE s2.source_id = snapshot.source_id
          ORDER BY s2.created_at DESC, s2.id DESC
          LIMIT 1
        )`,
      )
      .getMany();

    const snapBySource = new Map(latestSnaps.map((s) => [s.source_id, s]));
    const bySourcePresence = new Map<string, StoryFoldPresence[]>();
    for (const row of presenceRows) {
      const list = bySourcePresence.get(row.source_id) ?? [];
      list.push(row);
      bySourcePresence.set(row.source_id, list);
    }

    const sources: StoriesInWindowSourceRow[] = [];

    for (const sid of ids) {
      const snap = snapBySource.get(sid);
      const sourceName = snap?.source?.name ?? 'Unknown';
      const foldStories = Array.isArray(snap?.stories) ? snap.stories : [];
      const cappedFold = foldStories.slice(0, SnapshotsService.MAX_STORIES);
      const digestToStory = new Map<string, StoryItem>();
      for (const st of cappedFold) {
        digestToStory.set(this.storyPresenceDbKey(st), st);
      }

      const pres = bySourcePresence.get(sid) ?? [];
      const stories: StoryInWindowRow[] = pres.map((p) => {
        const item = digestToStory.get(p.story_key);
        return {
          story_key: p.story_key,
          title: item?.title?.trim() || 'Story not on current fold',
          url: item?.url,
          first_seen_at: p.first_seen_at.toISOString(),
        };
      });

      stories.sort(
        (a, b) =>
          new Date(b.first_seen_at).getTime() -
          new Date(a.first_seen_at).getTime(),
      );

      sources.push({
        source_id: sid,
        source_name: sourceName,
        stories_on_fold: Math.min(
          foldStories.length,
          SnapshotsService.MAX_STORIES,
        ),
        new_in_window: stories.length,
        stories,
      });
    }

    return { window_minutes: windowMinutes, sources };
  }
}
