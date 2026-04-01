export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function sourceUpdatedLabel(
  sourceUpdatedAt?: string | null,
): string | null {
  if (!sourceUpdatedAt) return null;
  return `Updated ${timeAgo(sourceUpdatedAt)}`;
}

export function crawlUpdatedLabel(crawledAt?: string | null): string {
  return `Crawled ${timeAgo(crawledAt || null)}`;
}

/** Duration from first_seen_at to as-of time (e.g. snapshot crawl time). */
export function onFoldSinceLabel(
  firstSeenAt: string | null | undefined,
  asOfIso: string | null | undefined,
): string {
  if (!firstSeenAt) return '—';
  const asOf = asOfIso ? new Date(asOfIso).getTime() : Date.now();
  const seconds = Math.floor((asOf - new Date(firstSeenAt).getTime()) / 1000);
  if (seconds < 60) return '~just on fold';
  if (seconds < 3600) return `~${Math.floor(seconds / 60)}m on fold`;
  if (seconds < 86400) return `~${Math.floor(seconds / 3600)}h on fold`;
  return `~${Math.floor(seconds / 86400)}d on fold`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString();
}

export function freshnessColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score > 0.8) return 'text-green-600';
  if (score >= 0.4) return 'text-amber-600';
  return 'text-red-600';
}

export function freshnessBg(score: number | null): string {
  if (score === null) return 'bg-muted';
  if (score > 0.8) return 'bg-green-100 text-green-800';
  if (score >= 0.4) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

export function freshnessLabel(score: number | null): string {
  if (score === null) return 'Unknown';
  if (score > 0.8) return 'Fresh';
  if (score >= 0.4) return 'Aging';
  return 'Stale';
}

const COST_PER_MILLION_TOKENS: Record<string, number> = {
  gemini: 0.15,
  claude: 3.0,
  openai: 2.5,
};

export function estimateCost(
  tokens: number,
  provider: string = 'gemini',
): string {
  const rate = COST_PER_MILLION_TOKENS[provider] ?? 1.0;
  const cost = (tokens / 1_000_000) * rate;
  return `$${cost.toFixed(4)}`;
}

export function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    gemini: 'Google Gemini',
    claude: 'Anthropic Claude',
    openai: 'OpenAI',
  };
  return labels[provider] || provider;
}
