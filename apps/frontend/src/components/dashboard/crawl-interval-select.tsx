'use client';

import { cn } from '@/lib/utils';

export type CrawlIntervalMinutes = 5 | 15 | 30;

const OPTIONS: { value: CrawlIntervalMinutes; label: string }[] = [
  { value: 5, label: 'Every 5 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
];

export function normalizeCrawlInterval(minutes: number): CrawlIntervalMinutes {
  return minutes === 5 || minutes === 15 || minutes === 30 ? minutes : 30;
}

export function CrawlIntervalSelect({
  value,
  onChange,
  disabled,
  id,
  className,
  'aria-label': ariaLabel,
}: {
  value: CrawlIntervalMinutes;
  onChange: (v: CrawlIntervalMinutes) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel ?? 'Crawl frequency'}
      className={cn(
        'flex h-9 w-full min-w-[10.5rem] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      value={value}
      disabled={disabled}
      onChange={(e) =>
        onChange(Number(e.target.value) as CrawlIntervalMinutes)
      }
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
