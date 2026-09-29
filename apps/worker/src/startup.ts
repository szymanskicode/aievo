import { rm } from 'node:fs/promises';
import path from 'node:path';

import { failOrphanedRuns } from '@aievo/db';
import type { Db } from '@aievo/db';
import type { Logger } from 'pino';

export interface CleanupDeps {
  db: Db;
  workDir: string;
  /** Removes every container labelled `aievo.run`; returns how many. */
  removeSandboxContainers: () => Promise<number>;
  logger: Logger;
}

/**
 * Tidies up after a worker that stopped without finishing its runs. Must run before this
 * worker takes jobs: it assumes a single worker process, so every active run, every sandbox
 * container and every run directory it finds belongs to the previous one.
 */
export async function cleanUpOrphans(deps: CleanupDeps): Promise<void> {
  const failed = await failOrphanedRuns(deps.db, {
    code: 'worker_restarted',
    message: 'The worker stopped while the run was in progress',
  });
  const containers = await deps.removeSandboxContainers();
  await rm(path.join(deps.workDir, 'runs'), { recursive: true, force: true, maxRetries: 5 });
  deps.logger.info(
    { failedRuns: failed.map((run) => run.id), removedContainers: containers },
    'Cleaned up after the previous worker',
  );
}
