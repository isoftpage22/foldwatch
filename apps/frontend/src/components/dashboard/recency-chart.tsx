'use client';

import { useRouter } from 'next/navigation';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { Snapshot } from '@/lib/api';

function getBarColor(score: number | null): string {
  if (score === null) return '#9ca3af';
  if (score > 0.8) return '#16a34a';
  if (score >= 0.4) return '#d97706';
  return '#dc2626';
}

interface ChartEntry {
  name: string;
  score: number;
  sourceId: string;
}

export function RecencyChart({ snapshots }: { snapshots: Snapshot[] }) {
  const router = useRouter();

  const data: ChartEntry[] = snapshots.map((s) => ({
    name: s.source?.name || 'Unknown',
    score: s.freshness_score || 0,
    sourceId: s.source_id,
  }));

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 100 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 1]} />
          <YAxis
            type="category"
            dataKey="name"
            width={90}
            tick={{ fontSize: 12 }}
          />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Tooltip
            formatter={(value: any) => [
              Number(value).toFixed(4),
              'Freshness',
            ]}
          />
          <Bar
            dataKey="score"
            radius={[0, 4, 4, 0]}
            cursor="pointer"
            onClick={(_data, index) => {
              const entry = data[index];
              if (entry?.sourceId) {
                router.push(`/sources/${entry.sourceId}`);
              }
            }}
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={getBarColor(entry.score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
