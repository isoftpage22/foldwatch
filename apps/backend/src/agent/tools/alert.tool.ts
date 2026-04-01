import { Injectable, Logger } from '@nestjs/common';
import { SourcesService } from '../../sources/sources.service';

@Injectable()
export class AlertTool {
  private readonly logger = new Logger(AlertTool.name);

  constructor(private readonly sourcesService: SourcesService) {}

  async execute(
    sourceId: string,
    reason: string,
  ): Promise<{ success: boolean; status?: string; failure_count?: number; error?: string }> {
    try {
      const source = await this.sourcesService.incrementFailure(sourceId);
      await this.sourcesService.markCrawled(sourceId, false);

      this.logger.warn(
        `Source ${sourceId} flagged: ${reason} (failures: ${source.failure_count})`,
      );

      return {
        success: true,
        status: source.status,
        failure_count: source.failure_count,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Alert failed for source ${sourceId}: ${message}`);
      return { success: false, error: message };
    }
  }
}
