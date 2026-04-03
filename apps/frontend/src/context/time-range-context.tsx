'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const STORAGE_KEY = 'foldwatch-time-range-id';

/** Matches plan: 5m … 1y in minutes */
export const TIME_RANGE_OPTIONS = [
  { id: '5m', label: '5m', minutes: 5 },
  { id: '15m', label: '15m', minutes: 15 },
  { id: '30m', label: '30m', minutes: 30 },
  { id: '1h', label: '1h', minutes: 60 },
  { id: '6h', label: '6h', minutes: 360 },
  { id: '24h', label: '24h', minutes: 1440 },
  { id: '7d', label: '7d', minutes: 10_080 },
  { id: '1mo', label: '1mo', minutes: 43_200 },
  { id: '3mo', label: '3mo', minutes: 129_600 },
  { id: '1y', label: '1y', minutes: 525_600 },
] as const;

export type TimeRangeId = (typeof TIME_RANGE_OPTIONS)[number]['id'];

function optionById(id: string) {
  return TIME_RANGE_OPTIONS.find((o) => o.id === id) ?? TIME_RANGE_OPTIONS[3]; // 1h
}

/** Backend `window_hours` for source-analytics (fractional allowed). */
export function windowMinutesToAnalyticsHours(minutes: number): number {
  return minutes / 60;
}

type TimeRangeContextValue = {
  rangeId: TimeRangeId;
  setRangeId: (id: TimeRangeId) => void;
  minutes: number;
  label: string;
};

const TimeRangeContext = createContext<TimeRangeContextValue | null>(null);

export function TimeRangeProvider({ children }: { children: React.ReactNode }) {
  const [rangeId, setRangeIdState] = useState<TimeRangeId>('1h');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && TIME_RANGE_OPTIONS.some((o) => o.id === raw)) {
        setRangeIdState(raw as TimeRangeId);
      }
    } catch {
      // ignore
    }
  }, []);

  const setRangeId = useCallback((id: TimeRangeId) => {
    setRangeIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const opt = optionById(rangeId);

  const value = useMemo(
    () => ({
      rangeId: opt.id as TimeRangeId,
      setRangeId,
      minutes: opt.minutes,
      label: opt.label,
    }),
    [opt.id, opt.minutes, opt.label, setRangeId],
  );

  return (
    <TimeRangeContext.Provider value={value}>
      {children}
    </TimeRangeContext.Provider>
  );
}

export function useTimeRange(): TimeRangeContextValue {
  const ctx = useContext(TimeRangeContext);
  if (!ctx) {
    throw new Error('useTimeRange must be used within TimeRangeProvider');
  }
  return ctx;
}

/** For components that may render outside the provider (tests). */
export function useTimeRangeOptional(): TimeRangeContextValue | null {
  return useContext(TimeRangeContext);
}

export function TimeRangeSelect({ className }: { className?: string }) {
  const { rangeId, setRangeId } = useTimeRange();

  return (
    <label
      className={`flex items-center gap-2 text-xs text-muted-foreground ${className ?? ''}`}
    >
      <span className="whitespace-nowrap hidden sm:inline">Time range</span>
      <select
        className="h-8 rounded-md border bg-background px-2 py-1 text-xs text-foreground max-w-[100px]"
        value={rangeId}
        title="Applies to Compare summary and Overview analytics"
        onChange={(e) => setRangeId(e.target.value as TimeRangeId)}
      >
        {TIME_RANGE_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
