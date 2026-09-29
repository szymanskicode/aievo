import { ACTIVE_RUN_STATUSES } from '@aievo/shared';
import type { RunStatus } from '@aievo/shared';

/** How often an open run is polled; live updates over SSE replace this in stage 3. */
export const RUN_POLL_MS = 3_000;

/** A run that can still change: waiting in the queue or being worked on. */
export function isOpenRun(status: RunStatus): boolean {
  return status === 'queued' || (ACTIVE_RUN_STATUSES as readonly RunStatus[]).includes(status);
}

export const runStatusLabels: Record<RunStatus, string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  running: 'Running',
  committing: 'Committing',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
