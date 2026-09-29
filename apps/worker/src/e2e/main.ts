/**
 * The worker of the E2E tests (`apps/web/playwright.config.ts`): real queue, database and
 * agent loop, faked model, git and GitHub. Not part of the build; it refuses to start
 * outside the E2E setup (see `assertE2eMode`).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createDb } from '@aievo/db';
import { createRunQueue } from '@aievo/queue';

import { loadEnv } from '../env.js';
import { createLogger } from '../logger.js';
import { executeRun } from '../run/execute-run.js';
import { createE2eDeps } from './e2e-deps.js';
import { assertE2eMode } from './e2e-mode.js';

const env = loadEnv();
assertE2eMode(process.env, env.DATABASE_URL);

const logger = createLogger(env.LOG_LEVEL);
const { db, close } = createDb(env.DATABASE_URL);
const workDir = await mkdtemp(path.join(tmpdir(), 'aievo-e2e-worker-'));

const deps = createE2eDeps({ db, logger, workDir, webUrl: env.AIEVO_WEB_URL, modelDelayMs: 300 });

const queue = await createRunQueue({
  connectionString: env.DATABASE_URL,
  role: 'worker',
  onError: (error) => logger.error({ err: error }, 'Run queue error'),
});
const shutdown = new AbortController();

await queue.startRunWorker(
  (job, jobSignal) => executeRun(job.runId, deps, AbortSignal.any([shutdown.signal, jobSignal])),
  { concurrency: 1 },
);
logger.info({ workDir }, 'AIEvo E2E worker waiting for runs');

function stop(): void {
  if (shutdown.signal.aborted) return;
  shutdown.abort();
  void queue
    .stop({ timeoutMs: 5_000 })
    .then(close)
    .then(() => rm(workDir, { recursive: true, force: true, maxRetries: 5 }))
    .then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error({ err: error }, 'Shutdown failed');
        process.exit(1);
      },
    );
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
