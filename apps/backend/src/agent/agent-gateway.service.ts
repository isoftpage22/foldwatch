import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrawlerTool } from './tools/crawler.tool';
import { DateParserTool } from './tools/date-parser.tool';
import { StorageTool } from './tools/storage.tool';
import { AlertTool } from './tools/alert.tool';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { Source } from '../sources/entities/source.entity';
import { AgentResultDto } from './dto/agent-result.dto';
import { ToolDefinition, ToolResult } from './providers/ai-provider.interface';
import { createAiProvider } from './providers/provider.factory';

type CrawlPayload = {
  stories?: {
    title: string;
    url?: string;
    source_updated_at?: string;
    source_updated_source?: string;
    source_time_available?: boolean;
  }[];
  video_urls?: string[];
};

@Injectable()
export class AgentGatewayService {
  private readonly logger = new Logger(AgentGatewayService.name);
  private readonly MAX_STEPS: number;
  private readonly abortedRuns = new Set<string>();
  /** Per agent run id: last successful crawl_url output per source_id (LLM may drop stories on save). */
  private readonly crawlCachesByRunId = new Map<string, Map<string, CrawlPayload>>();

  constructor(
    private readonly config: ConfigService,
    private readonly crawlerTool: CrawlerTool,
    private readonly dateParserTool: DateParserTool,
    private readonly storageTool: StorageTool,
    private readonly alertTool: AlertTool,
    private readonly agentRunsService: AgentRunsService,
  ) {
    this.MAX_STEPS = this.config.get<number>('crawl.maxAgentSteps') || 15;
    const providerType =
      (this.config.get<string>('ai.provider') as string) || 'gemini';
    this.logger.log(
      `Agent gateway initialized (AI_PROVIDER=${providerType}). A fresh provider is created per run so concurrent crawls do not share chat state.`,
    );
  }

  requestAbort(runId: string) {
    this.abortedRuns.add(runId);
    this.logger.warn(`Abort requested for run ${runId}`);
  }

  async runCrawlAgent(sources: Source[]): Promise<AgentResultDto> {
    
    const run = await this.agentRunsService.create({
      task_type: 'crawl_sources',
    });

    const sourcesSummary = sources
      .map((s) => `${s.name} (${s.url})`)
      .join(', ');
    const aiProvider = createAiProvider(this.config);
    this.logger.log(
      `Starting agent run ${run.id} for ${sources.length} sources: [${sourcesSummary}] (provider: ${aiProvider.providerName})`,
    );

    const systemPrompt = `You are a web intelligence agent for FoldWatch.
Your job is to crawl N website sources, extract their first-fold content (headline, summary, hero image), detect the most accurate publish/modified date, compute a freshness score, and store results.

For each source:
1. Call crawl_url to get the raw first-fold data
2. Call parse_date with the raw HTML to extract the best date signal
3. Call save_snapshot to persist the result — pass the stories array and video_urls EXACTLY as returned by crawl_url. Do NOT add, remove, or re-count stories. For each story, extract 2-5 keywords from the title.
4. If crawl fails, call flag_source_error so the source is marked for review

Process all sources. When all are done, call finish with a summary.

Freshness score formula: 1 / (1 + hours_since_modified)
Round to 4 decimal places.`;
    
    const userMessage = `Process these ${sources.length} sources: ${JSON.stringify(
      sources.map((s) => ({ id: s.id, url: s.url, name: s.name })),
    )}`;

    this.crawlCachesByRunId.set(run.id, new Map());
    try {
      let response = await aiProvider.startConversation(
        systemPrompt,
        userMessage,
        this.getToolDefinitions(),
      );

      for (let step = 0; step < this.MAX_STEPS; step++) {
        if (this.abortedRuns.has(run.id)) {
          this.abortedRuns.delete(run.id);
          this.logger.warn(`Agent run ${run.id} aborted by user at step ${step}`);
          await this.agentRunsService.abort(run.id);
          break;
        }

        if (response.textContent) {
          await this.agentRunsService.addStep(run.id, {
            step_number: step,
            type: 'think',
            reasoning_text: response.textContent,
            tokens_used: response.tokensUsed,
          });
        }

        if (response.done) {
          await this.agentRunsService.addStep(run.id, {
            step_number: step,
            type: 'final',
            reasoning_text: response.textContent || 'Agent completed',
            tokens_used: 0,
          });
          await this.agentRunsService.complete(
            run.id,
            response.textContent?.trim() || 'Completed',
          );
          break;
        }

        if (response.toolCalls.length > 0) {
          const toolResults: ToolResult[] = [];

          for (const call of response.toolCalls) {
            await this.agentRunsService.addStep(run.id, {
              step_number: step,
              type: 'tool_call',
              tool_name: call.name,
              tool_input: call.input,
            });

            let result: unknown;
            try {
              result = await this.executeTool(run.id, call.name, call.input);
            } catch (err) {
              const errMsg =
                err instanceof Error ? err.message : 'Unknown tool error';
              const toolUrl =
                (call.input as Record<string, unknown>)?.url || '';
              const sourceId =
                (call.input as Record<string, unknown>)?.source_id || '';
              this.logger.error(
                `Tool ${call.name} failed for source ${sourceId}${toolUrl ? ` (${toolUrl})` : ''}: ${errMsg}`,
              );
              result = {
                success: false,
                error: errMsg,
              };
            }

            await this.agentRunsService.addStep(run.id, {
              step_number: step,
              type: 'tool_result',
              tool_name: call.name,
              tool_output: result as object,
            });

            toolResults.push({
              callId: call.id,
              output: JSON.stringify(result),
            });
          }

          // Ensure we have the same number of tool results as tool calls for OpenAI
          if (toolResults.length !== response.toolCalls.length) {
            this.logger.error(
              `Tool results count mismatch: ${toolResults.length} results vs ${response.toolCalls.length} calls`,
            );
            await this.agentRunsService.fail(
              run.id,
              'Tool results count mismatch with tool calls',
            );
            break;
          }

          response = await aiProvider.continueWithToolResults(toolResults);
        } else {
          await this.agentRunsService.fail(
            run.id,
            'Agent returned incomplete state (no tool calls, not finished)',
          );
          break;
        }
      }

      const afterLoop = await this.agentRunsService.findOne(run.id);
      if (afterLoop.status === 'running') {
        await this.agentRunsService.fail(
          run.id,
          `Max agent steps (${this.MAX_STEPS}) exceeded without completion`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Agent run ${run.id} failed: ${message}`);
      await this.agentRunsService.fail(run.id, message);
    } finally {
      this.crawlCachesByRunId.delete(run.id);
    }

    const finalRun = await this.agentRunsService.findOne(run.id);
    return {
      run_id: finalRun.id,
      status: finalRun.status as AgentResultDto['status'],
      total_steps: finalRun.total_steps,
      total_tokens: finalRun.total_tokens,
      final_summary: finalRun.final_summary,
      started_at: finalRun.started_at,
      completed_at: finalRun.completed_at,
    };
  }

  private async executeTool(
    runId: string,
    name: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const crawlCache = this.crawlCachesByRunId.get(runId);

    switch (name) {
      case 'crawl_url': {
        const out = await this.crawlerTool.execute(
          input.source_id as string,
          input.url as string,
        );
        if (
          out.success &&
          crawlCache &&
          (out.stories?.length || out.video_urls?.length)
        ) {
          crawlCache.set(input.source_id as string, {
            stories: out.stories,
            video_urls: out.video_urls,
          });
        }
        return out;
      }
      case 'parse_date':
        return this.dateParserTool.execute(
          input.source_id as string,
          input.raw_html as string,
          input.url as string,
        );
      case 'save_snapshot': {
        const sourceId = input.source_id as string;
        let stories = this.parseJsonField(input.stories) as
          | {
              title: string;
              url?: string;
              keywords?: string[];
              source_updated_at?: string;
              source_updated_source?: string;
              source_time_available?: boolean;
            }[]
          | undefined;
        let videoUrls = this.parseJsonField(input.video_urls) as
          | string[]
          | undefined;

        const cached = crawlCache?.get(sourceId);
        if (!Array.isArray(stories) || stories.length === 0) {
          if (cached?.stories?.length) {
            this.logger.log(
              `save_snapshot: persisted ${cached.stories.length} stories from crawl_url cache for ${sourceId} (model stories JSON was invalid or empty)`,
            );
            stories = cached.stories.map((s) => ({
              title: s.title,
              url: s.url,
              keywords: this.keywordsFromTitle(s.title),
              source_updated_at: s.source_updated_at,
              source_updated_source: s.source_updated_source,
              source_time_available: s.source_time_available,
            }));
          }
        }
        if (!Array.isArray(videoUrls) || videoUrls.length === 0) {
          if (cached?.video_urls?.length) {
            videoUrls = cached.video_urls;
          }
        }

        return this.storageTool.execute({
          source_id: sourceId,
          headline: input.headline as string | undefined,
          summary: input.summary as string | undefined,
          hero_image_url: input.hero_image_url as string | undefined,
          published_at: input.published_at as string | undefined,
          modified_at: input.modified_at as string | undefined,
          date_source: input.date_source as string | undefined,
          freshness_score: input.freshness_score as number,
          stories,
          video_urls: videoUrls,
        });
      }
      case 'flag_source_error':
        return this.alertTool.execute(
          input.source_id as string,
          input.reason as string,
        );
      case 'finish':
        return {
          success: true,
          summary: input.summary,
          sources_processed: input.sources_processed,
          sources_failed: input.sources_failed || 0,
        };
      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  }

  /** Fallback keywords when model omits them but we use crawl cache. */
  private keywordsFromTitle(title: string): string[] {
    const words = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const uniq = [...new Set(words)];
    return uniq.slice(0, 5);
  }

  private parseJsonField(value: unknown): unknown {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      let raw = value;
      // Gemini sometimes emits \' (backslash-single-quote) which is invalid
      // JSON. Strip those backslashes so JSON.parse succeeds.
      raw = raw.replace(/\\'/g, "'");
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Common when the model stringifies stories with invalid JSON; crawl cache recovers.
        this.logger.debug(
          `parseJsonField: invalid JSON string (len=${value.length}): ${value.substring(0, 120)}…`,
        );
      }
    }
    return undefined;
  }

  private getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'crawl_url',
        description:
          'Crawls a URL and extracts first-fold content: headline, summary, hero image URL, and raw HTML of the visible above-the-fold section. Use this first for every source.',
        parameters: {
          type: 'object',
          properties: {
            source_id: {
              type: 'string',
              description: 'UUID of the source',
            },
            url: { type: 'string', description: 'Full URL to crawl' },
          },
          required: ['source_id', 'url'],
        },
      },
      {
        name: 'parse_date',
        description:
          'Extracts the most accurate publish or modified date from a page. Checks in order: schema.org JSON-LD, OG article:modified_time, <time> elements, HTTP Last-Modified header, visible date text. Returns ISO 8601 UTC string and the source of the date signal.',
        parameters: {
          type: 'object',
          properties: {
            source_id: { type: 'string' },
            raw_html: {
              type: 'string',
              description: 'Raw HTML from crawl_url result',
            },
            url: { type: 'string' },
          },
          required: ['source_id', 'raw_html', 'url'],
        },
      },
      {
        name: 'save_snapshot',
        description:
          'Persists the extracted first-fold snapshot for a source including headline, summary, hero image, date, freshness score, date signal source, stories found on the first fold, and video URLs.',
        parameters: {
          type: 'object',
          properties: {
            source_id: { type: 'string' },
            headline: { type: 'string' },
            summary: { type: 'string' },
            hero_image_url: { type: 'string' },
            published_at: {
              type: 'string',
              description: 'ISO 8601 UTC',
            },
            modified_at: {
              type: 'string',
              description: 'ISO 8601 UTC',
            },
            date_source: {
              type: 'string',
              description:
                'One of: schema_org, og_tag, time_element, http_header, parsed_text',
            },
            freshness_score: {
              type: 'number',
              description: '0-1 score',
            },
            stories: {
              type: 'array',
              description:
                'Stories/headlines visible on the first fold. For each story, extract 2-5 keywords from the title.',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  url: { type: 'string' },
                  keywords: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '2-5 keywords extracted from the story title',
                  },
                },
                required: ['title'],
              },
            },
            video_urls: {
              type: 'array',
              description: 'Video embed/source URLs found on the page',
              items: { type: 'string' },
            },
          },
          required: ['source_id', 'headline', 'freshness_score'],
        },
      },
      {
        name: 'flag_source_error',
        description:
          'Marks a source as errored when crawling or extraction fails. Increments failure count. If failure_count > 3, sets status to error.',
        parameters: {
          type: 'object',
          properties: {
            source_id: { type: 'string' },
            reason: {
              type: 'string',
              description: 'Why the crawl failed',
            },
          },
          required: ['source_id', 'reason'],
        },
      },
      {
        name: 'finish',
        description:
          'Call this when all sources have been processed. Provide a summary of what was done.',
        parameters: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            sources_processed: { type: 'number' },
            sources_failed: { type: 'number' },
          },
          required: ['summary', 'sources_processed'],
        },
      },
    ];
  }
}
