'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import type { AgentRun } from '@/lib/api';

const statusVariant: Record<string, string> = {
  running: 'bg-blue-100 text-blue-800 animate-pulse',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  aborted: 'bg-gray-100 text-gray-800',
};

function duration(start: string, end: string | null): string {
  if (!end) return 'In progress';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export function AgentRunTimeline({ runs }: { runs: AgentRun[] }) {
  const router = useRouter();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Started</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Events</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          <TableHead className="text-right">Duration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              No agent runs yet
            </TableCell>
          </TableRow>
        )}
        {runs.map((run) => (
          <TableRow
            key={run.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => router.push(`/runs?id=${run.id}`)}
          >
            <TableCell className="text-sm">{formatDate(run.started_at)}</TableCell>
            <TableCell className="text-sm">{run.task_type}</TableCell>
            <TableCell>
              <Badge
                variant="secondary"
                className={statusVariant[run.status] || ''}
              >
                {run.status}
              </Badge>
            </TableCell>
            <TableCell className="text-right">{run.total_steps}</TableCell>
            <TableCell className="text-right">
              {run.total_tokens.toLocaleString()}
            </TableCell>
            <TableCell className="text-right">
              {duration(run.started_at, run.completed_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
