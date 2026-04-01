import { Badge } from '@/components/ui/badge';
import { freshnessBg, freshnessLabel } from '@/lib/format';

export function RecencyBadge({ score }: { score: number | null }) {
  return (
    <Badge variant="secondary" className={freshnessBg(score)}>
      {freshnessLabel(score)}
    </Badge>
  );
}
