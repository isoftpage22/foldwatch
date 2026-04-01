import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';

type StoryItem = {
  title: string;
  url?: string;
  source_updated_at?: string;
  source_updated_source?: string;
  source_time_available?: boolean;
};

@Injectable()
export class CrawlerTool {
  private readonly logger = new Logger(CrawlerTool.name);

  async execute(
    sourceId: string,
    url: string,
  ): Promise<{
    success: boolean;
    headline?: string;
    summary?: string;
    hero_image_url?: string;
    raw_html?: string;
    stories?: StoryItem[];
    video_urls?: string[];
    error?: string;
  }> {
    try {
      let html: string;

      try {
        html = await this.crawlWithPlaywright(url);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Playwright failed for ${url} (${reason}); falling back to fetch+cheerio`,
        );
        html = await this.crawlWithFetch(url);
      }

      const $ = cheerio.load(html);

      const headline =
        $('meta[property="og:title"]').attr('content') ||
        $('h1').first().text().trim() ||
        $('title').text().trim() ||
        null;

      const summary =
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        $('p').first().text().trim().substring(0, 300) ||
        null;

      const heroImageUrl =
        $('meta[property="og:image"]').attr('content') || null;

      const stories = await this.enrichStoryTimings(
        this.extractStories($, url),
      );
      const videoUrls = this.extractVideoUrls($);

      const bodyHtml = $('body').html() || '';
      const rawHtml = bodyHtml.substring(0, 15000);

      return {
        success: true,
        headline: headline || undefined,
        summary: summary || undefined,
        hero_image_url: heroImageUrl || undefined,
        raw_html: rawHtml,
        stories: stories.length > 0 ? stories : undefined,
        video_urls: videoUrls.length > 0 ? videoUrls : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Crawl failed for source ${sourceId}: ${message}`);
      return { success: false, error: message };
    }
  }

  private extractStories(
    $: cheerio.CheerioAPI,
    pageUrl: string,
  ): StoryItem[] {
    const seen = new Set<string>();
    const stories: StoryItem[] = [];

    const addStory = (rawTitle: string, href: string | undefined) => {
      const title = rawTitle.trim().replace(/\s+/g, ' ');
      if (!title || title.length < 15 || title.length > 300) return;
      const key = title.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      let absolute: string | undefined;
      try {
        absolute = href ? new URL(href, pageUrl).href : undefined;
      } catch {
        absolute = href;
      }
      stories.push({ title, url: absolute });
    };

    // Phase 1: semantic heading selectors (sites with proper h2/h3 markup)
    const headingSelectors = [
      'article h2 a, article h3 a, article h4 a',
      'article h2, article h3, article h4',
      '[class*="story"] h2 a, [class*="story"] h3 a',
      '[class*="story"] h2, [class*="story"] h3',
      '[data-testid*="story"] a',
      'main h2 a, main h3 a',
      'h2 a, h3 a',
    ].join(', ');

    $(headingSelectors).each((_, el) => {
      const $el = $(el);
      const title = $el.text().trim();
      const anchor = $el.is('a') ? $el : $el.find('a').first();
      const href =
        anchor.attr('href') || $el.closest('a').attr('href') || undefined;
      if (!this.isLikelyArticleLink(href, pageUrl)) return;
      addStory(title, href);
    });

    // Phase 2: anchor-based extraction — works for sites like TOI that use
    // <div> instead of <h2>/<h3> for headlines. We scan every <a> with an
    // article-like URL and intelligently extract the headline text.
    $('a[href]').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href');
      if (!this.isLikelyArticleLink(href, pageUrl)) return;

      const title = this.extractTitleFromAnchor($, $a);
      addStory(title, href);
    });

    return stories.slice(0, 30);
  }

  private async enrichStoryTimings(stories: StoryItem[]): Promise<StoryItem[]> {
    if (stories.length === 0) return stories;

    const queue = [...stories];
    const out: StoryItem[] = [];
    const workers: Promise<void>[] = [];
    const concurrency = 4;

    const worker = async () => {
      while (queue.length > 0) {
        const story = queue.shift();
        if (!story) continue;

        if (!story.url) {
          out.push({ ...story, source_time_available: false });
          continue;
        }

        try {
          const parsed = await this.fetchStoryUpdatedAt(story.url);
          if (parsed?.updatedAt) {
            out.push({
              ...story,
              source_updated_at: parsed.updatedAt,
              source_updated_source: parsed.source,
              source_time_available: true,
            });
          } else {
            out.push({ ...story, source_time_available: false });
          }
        } catch {
          out.push({ ...story, source_time_available: false });
        }
      }
    };

    for (let i = 0; i < Math.min(concurrency, stories.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    const order = new Map(stories.map((s, i) => [this.storySortKey(s), i]));
    out.sort(
      (a, b) =>
        (order.get(this.storySortKey(a)) ?? 0) -
        (order.get(this.storySortKey(b)) ?? 0),
    );
    return out;
  }

  private storySortKey(story: StoryItem): string {
    return `${story.url || ''}::${story.title}`;
  }

  private async fetchStoryUpdatedAt(
    url: string,
  ): Promise<{ updatedAt: string; source: string } | null> {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; FoldWatch/1.0; +https://foldwatch.dev)',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    const directMetaCandidates: Array<{ raw: string; source: string }> = [];
    const collect = (selector: string, source: string) => {
      $(selector).each((_, el) => {
        const content = $(el).attr('content') || $(el).attr('datetime');
        if (content) {
          directMetaCandidates.push({ raw: content, source });
        }
      });
    };

    collect('meta[property="article:modified_time"]', 'article_meta');
    collect('meta[property="og:updated_time"]', 'og_updated');
    collect('meta[name="last-modified"]', 'meta_last_modified');
    collect('meta[itemprop="dateModified"]', 'itemprop_dateModified');
    collect('time[datetime]', 'time_datetime');

    const ldJsonCandidates = this.extractLdModifiedDates($);
    for (const c of ldJsonCandidates) {
      directMetaCandidates.push(c);
    }

    for (const c of directMetaCandidates) {
      const parsed = this.parseDateText(c.raw);
      if (parsed) return { updatedAt: parsed.toISOString(), source: c.source };
    }

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const textualPatterns = [
      /Updated\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}\s*(?:IST|UTC|GMT)?)/i,
      /Last\s+Updated\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}\s*(?:IST|UTC|GMT)?)/i,
      /Updated\s+on\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:IST|UTC|GMT)?)/i,
    ];

    for (const re of textualPatterns) {
      const m = bodyText.match(re);
      const raw = m?.[1]?.trim();
      if (!raw) continue;
      const parsed = this.parseDateText(raw);
      if (parsed) return { updatedAt: parsed.toISOString(), source: 'body_text' };
    }

    return null;
  }

  private extractLdModifiedDates(
    $: cheerio.CheerioAPI,
  ): Array<{ raw: string; source: string }> {
    const out: Array<{ raw: string; source: string }> = [];
    const scripts = $('script[type="application/ld+json"]');

    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const rec = node as Record<string, unknown>;
      const mod = rec.dateModified;
      if (typeof mod === 'string' && mod.trim()) {
        out.push({ raw: mod, source: 'schema_org' });
      }
      const pub = rec.datePublished;
      if (typeof pub === 'string' && pub.trim()) {
        out.push({ raw: pub, source: 'schema_org_published' });
      }
      for (const v of Object.values(rec)) {
        if (Array.isArray(v)) {
          for (const item of v) walk(item);
        } else if (v && typeof v === 'object') {
          walk(v);
        }
      }
    };

    for (let i = 0; i < scripts.length; i++) {
      const raw = $(scripts[i]).html() || '';
      if (!raw.trim()) continue;
      try {
        walk(JSON.parse(raw));
      } catch {
        continue;
      }
    }

    return out;
  }

  private parseDateText(raw: string): Date | null {
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    const normalized = cleaned.replace(/\bIST\b/i, '+05:30');
    const firstPass = new Date(normalized);
    if (!isNaN(firstPass.getTime())) return firstPass;

    const secondPass = new Date(cleaned.replace(/\bUTC\b/i, 'GMT'));
    if (!isNaN(secondPass.getTime())) return secondPass;

    return null;
  }

  /**
   * Extracts a clean headline from an anchor element by preferring semantic
   * children (headings, figcaptions) and falling back to stripping non-title
   * elements (images, descriptions, section labels, timestamps).
   */
  private extractTitleFromAnchor(
    $: cheerio.CheerioAPI,
    $a: cheerio.Cheerio<any>,
  ): string {
    const $heading = $a.find('h1, h2, h3, h4, h5, h6').first();
    if ($heading.length) {
      const t = $heading.text().trim().replace(/\s+/g, ' ');
      if (t.length >= 15) return t;
    }

    const $caption = $a.find('figcaption').first();
    if ($caption.length) {
      const t = $caption.text().trim().replace(/\s+/g, ' ');
      if (t.length >= 15) return t;
    }

    const $clone = $a.clone();
    $clone
      .find(
        'p, img, svg, style, script, time, picture, video, source, noscript, iframe, section, [class*="timestamp"]',
      )
      .remove();

    let text = $clone.text().trim().replace(/\s+/g, ' ');

    // Strip leading timestamps (e.g. "04:21 " or "10:29 ")
    text = text.replace(/^\d{1,2}:\d{2}\s+/, '');

    return text;
  }

  private isLikelyArticleLink(
    href: string | undefined,
    baseUrl: string,
  ): boolean {
    if (!href || href === '#' || href.startsWith('javascript:')) return false;
    try {
      const u = new URL(href, baseUrl);
      const base = new URL(baseUrl);
      if (u.hostname !== base.hostname) return false;

      const path = u.pathname.toLowerCase();
      const segs = path.split('/').filter(Boolean);

      const hubSlugs = new Set([
        'games',
        'videos',
        'photos',
        'news',
        'india',
        'world',
        'sports',
        'business',
        'entertainment',
        'timespoints',
        'epr',
        'city',
        'tv',
        'web-series',
        'technology',
        'science',
        'education',
        'lifestyle',
        'health',
        'travel',
        'astrology',
        'toi-plus',
        'elections',
        'us',
        'uk',
        'middle-east',
      ]);

      if (segs.length === 1 && hubSlugs.has(segs[0])) return false;
      if (segs.length === 2 && hubSlugs.has(segs[1])) return false;

      if (
        path.includes('articleshow') ||
        path.includes('videoshow') ||
        path.includes('photostory') ||
        path.includes('liveblog')
      ) {
        return true;
      }

      if (/\.cms$/i.test(path) && /\d{5,}/.test(path)) return true;

      if (/-\d{6,}\/?$/i.test(path)) return true;

      if (segs.length >= 5 && /\d/.test(segs[segs.length - 1] || ''))
        return true;

      if (segs.length >= 6) return true;

      return false;
    } catch {
      return false;
    }
  }

  private extractVideoUrls($: cheerio.CheerioAPI): string[] {
    const urls = new Set<string>();
    const videoPattern =
      /youtube\.com|youtu\.be|dailymotion\.com|vimeo\.com|player\.|embed\//i;

    $('video[src]').each((_, el) => {
      const src = $(el).attr('src');
      if (src) urls.add(src);
    });

    $('video source[src]').each((_, el) => {
      const src = $(el).attr('src');
      if (src) urls.add(src);
    });

    $('iframe[src]').each((_, el) => {
      const src = $(el).attr('src');
      if (src && videoPattern.test(src)) urls.add(src);
    });

    const ogVideo = $('meta[property="og:video"]').attr('content');
    if (ogVideo) urls.add(ogVideo);

    const ogVideoUrl = $('meta[property="og:video:url"]').attr('content');
    if (ogVideoUrl) urls.add(ogVideoUrl);

    return [...urls];
  }

  private async crawlWithPlaywright(url: string): Promise<string> {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return await page.content();
    } finally {
      await browser.close();
    }
  }

  private async crawlWithFetch(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; FoldWatch/1.0; +https://foldwatch.dev)',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.text();
  }
}
