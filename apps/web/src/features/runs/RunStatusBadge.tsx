import type { RunStatus } from '@aievo/shared';
import { LoaderCircleIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

import { isOpenRun, runStatusLabels } from './run-status';

const variants = {
  queued: 'secondary',
  preparing: 'secondary',
  running: 'secondary',
  committing: 'secondary',
  succeeded: 'default',
  failed: 'destructive',
  cancelled: 'outline',
} as const satisfies Record<RunStatus, string>;

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge variant={variants[status]}>
      {isOpenRun(status) && <LoaderCircleIcon className="animate-spin" aria-hidden />}
      {runStatusLabels[status]}
    </Badge>
  );
}
