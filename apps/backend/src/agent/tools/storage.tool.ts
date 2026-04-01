import { Injectable, Logger } from '@nestjs/common';
import { SnapshotsService } from '../../snapshots/snapshots.service';
import { SourcesService } from '../../sources/sources.service';

interface SaveSnapshotInput {
  source_id: string;
  headline?: string;
  summary?: string;
  hero_image_url?: string;
  published_at?: string;
  modified_at?: string;
  date_source?: string;
  freshness_score: number;
  stories?: {
    title: string;
    url?: string;
    keywords?: string[];
    source_updated_at?: string;
    source_updated_source?: string;
    source_time_available?: boolean;
  }[];
  video_urls?: string[];
}

@Injectable()
export class StorageTool {
  private readonly logger = new Logger(StorageTool.name);

  constructor(
    private readonly snapshotsService: SnapshotsService,
    private readonly sourcesService: SourcesService,
  ) {}

  async execute(
    input: SaveSnapshotInput,
  ): Promise<{ success: boolean; snapshot_id?: string; error?: string }> {
    try {
      const snapshot = await this.snapshotsService.create({
        source_id: input.source_id,
        headline: input.headline,
        summary: input.summary,
        hero_image_url: input.hero_image_url,
        published_at: input.published_at,
        modified_at: input.modified_at,
        date_source: input.date_source,
        freshness_score: input.freshness_score,
        stories: input.stories,
        video_urls: input.video_urls,
      });

      await this.sourcesService.markCrawled(input.source_id, true);

      this.logger.log(
        `Saved snapshot ${snapshot.id} for source ${input.source_id}`,
      );

      return { success: true, snapshot_id: snapshot.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Storage failed for source ${input.source_id}: ${message}`,
      );
      return { success: false, error: message };
    }
  }
}
