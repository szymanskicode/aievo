import type { Run } from '@aievo/db';
import { runErrorSchema } from '@aievo/shared';
import type { RunDto } from '@aievo/shared';

export function serializeRun(row: Run): RunDto {
  // `error` is written by the worker as `{ code, message }`; anything else is not returned.
  const error = runErrorSchema.safeParse(row.error);
  return {
    id: row.id,
    taskId: row.taskId,
    status: row.status,
    branch: row.branch,
    prUrl: row.prUrl,
    prNumber: row.prNumber,
    costUsd: row.costUsd,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    error: error.success ? { code: error.data.code, message: error.data.message } : null,
    cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
