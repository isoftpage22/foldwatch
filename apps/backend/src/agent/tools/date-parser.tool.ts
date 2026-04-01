import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';

interface DateResult {
  success: boolean;
  date?: string;
  source?: string;
  error?: string;
}

interface DateCandidate {
  date: Date;
  source: string;
}

@Injectable()
export class DateParserTool {
  private readonly logger = new Logger(DateParserTool.name);

  async execute(
    sourceId: string,
    rawHtml: string,
    url: string,
  ): Promise<DateResult> {
    try {
      const $ = cheerio.load(rawHtml);
      const now = new Date();
      const RECENCY_MS = 2 * 60 * 60 * 1000; // 2 hours

      const structured: DateCandidate[] = [];
      this.collectSchemaOrgDates($, structured);
      this.collectOgDates($, structured);
      this.collectTimeElements($, structured);

      const httpDate = await this.getHttpLastModified(url);
      if (httpDate) {
        const d = new Date(httpDate);
        if (!isNaN(d.getTime())) {
          structured.push({ date: d, source: 'http_header' });
        }
      }

      const validStructured = structured.filter(
        (c) =>
          !isNaN(c.date.getTime()) &&
          c.date.getTime() <= now.getTime() + 86_400_000,
      );

      if (validStructured.length > 0) {
        validStructured.sort((a, b) => b.date.getTime() - a.date.getTime());
        const best = validStructured[0];
        const age = now.getTime() - best.date.getTime();

        if (age <= RECENCY_MS) {
          this.logger.debug(
            `Source ${sourceId}: using ${best.source} date ${best.date.toISOString()} (${Math.round(age / 60000)}m old)`,
          );
          return {
            success: true,
            date: best.date.toISOString(),
            source: best.source,
          };
        }

        this.logger.debug(
          `Source ${sourceId}: best structured date is ${Math.round(age / 3600000)}h old (${best.source}); using crawl timestamp instead`,
        );
      } else {
        this.logger.debug(
          `Source ${sourceId}: no structured dates found; using crawl timestamp`,
        );
      }

      return {
        success: true,
        date: now.toISOString(),
        source: 'crawl_time',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Date parse failed for source ${sourceId}: ${message}`);
      return { success: false, error: message };
    }
  }

  private collectSchemaOrgDates(
    $: cheerio.CheerioAPI,
    out: DateCandidate[],
  ): void {
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      try {
        const raw = JSON.parse($(scripts[i]).html() || '');
        const items = Array.isArray(raw) ? raw : [raw];
        for (const data of items) {
          this.extractLdDates(data, out);
        }
      } catch {
        continue;
      }
    }
  }

  private extractLdDates(data: Record<string, unknown>, out: DateCandidate[]): void {
    if (data.dateModified) {
      const d = new Date(data.dateModified as string);
      if (!isNaN(d.getTime())) out.push({ date: d, source: 'schema_org' });
    }
    if (data.datePublished) {
      const d = new Date(data.datePublished as string);
      if (!isNaN(d.getTime())) out.push({ date: d, source: 'schema_org' });
    }
    if (Array.isArray(data['@graph'])) {
      for (const item of data['@graph'] as Record<string, unknown>[]) {
        this.extractLdDates(item, out);
      }
    }
    if (data.mainEntity && typeof data.mainEntity === 'object') {
      this.extractLdDates(data.mainEntity as Record<string, unknown>, out);
    }
    if (Array.isArray(data.itemListElement)) {
      for (const item of data.itemListElement as Record<string, unknown>[]) {
        if (item.item && typeof item.item === 'object') {
          this.extractLdDates(item.item as Record<string, unknown>, out);
        }
      }
    }
  }

  private collectOgDates(
    $: cheerio.CheerioAPI,
    out: DateCandidate[],
  ): void {
    const selectors = [
      'meta[property="article:modified_time"]',
      'meta[property="article:published_time"]',
      'meta[property="og:updated_time"]',
    ];
    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const content = $(el).attr('content');
        if (content) {
          const d = new Date(content);
          if (!isNaN(d.getTime())) out.push({ date: d, source: 'og_tag' });
        }
      });
    }
  }

  private collectTimeElements(
    $: cheerio.CheerioAPI,
    out: DateCandidate[],
  ): void {
    $('time[datetime]').each((_, el) => {
      const dt = $(el).attr('datetime');
      if (dt) {
        const d = new Date(dt);
        if (!isNaN(d.getTime())) out.push({ date: d, source: 'time_element' });
      }
    });
  }

  private async getHttpLastModified(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      return res.headers.get('last-modified');
    } catch {
      return null;
    }
  }

}
