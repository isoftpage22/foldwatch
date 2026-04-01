import { createHash, randomUUID } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
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
}
