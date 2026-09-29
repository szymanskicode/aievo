import path from 'node:path';

import { createDb } from '@aievo/db';
import { createGitHubProvider, createLocalGit } from '@aievo/git';
import { loadAgentPreset } from '@aievo/presets';
import { createRunQueue } from '@aievo/queue';
import {
  Docker,
  createDockerSandboxFactory,
  removeSandboxContainers,
  resolveSandboxUser,
} from '@aievo/sandbox';
import { createSecretBox } from '@aievo/shared/crypto';

import { loadEnv, loadMasterKey } from './env.js';
import { createLogger } from './logger.js';
import { createAgentModelOpener } from './run/agent-model.js';
import { executeRun } from './run/execute-run.js';
import type { RunnerDeps } from './run/execute-run.js';
import { createGitTokenOpener } from './run/git-token.js';
import { cleanUpOrphans } from './startup.js';

/** Longest wait for running jobs on shutdown before the process exits anyway. */
const SHUTDOWN_TIMEOUT_MS = 30_000;

const env = loadEnv();
// Fails fast with a readable message before any job is taken.
const secretBox = createSecretBox(loadMasterKey());
const logger = createLogger(env.LOG_LEVEL);
const { db, close } = createDb(env.DATABASE_URL);
const docker = new Docker();

const deps: RunnerDeps = {
  db,
  git: await createLocalGit({ stateDir: path.join(env.AIEVO_WORKDIR, 'git') }),
  sandboxes: createDockerSandboxFactory({
    docker,
    image: env.AIEVO_SANDBOX_IMAGE,
    user: resolveSandboxUser(env.AIEVO_SANDBOX_USER),
  }),
  openGitToken: createGitTokenOpener(db, secretBox),
  openAgentModel: createAgentModelOpener(db, secretBox),
  gitProvider: (token) => createGitHubProvider(token),
  loadAgentPreset: (key) => loadAgentPreset(key),
  logger,
  config: {
    workDir: env.AIEVO_WORKDIR,
    maxRunMs: env.AIEVO_RUN_MAX_MINUTES * 60_000,
    maxRunsPerProject: env.AIEVO_MAX_RUNS_PER_PROJECT,
    commandTimeoutMs: env.AIEVO_COMMAND_TIMEOUT_MINUTES * 60_000,
    limits: {
      memoryMb: env.AIEVO_SANDBOX_MEMORY_MB,
      cpus: env.AIEVO_SANDBOX_CPUS,
      pids: env.AIEVO_SANDBOX_PIDS,
    },
    busyRetrySeconds: 15,
    cancelPollMs: 2_000,
    gitHostUrl: 'https://github.com',
    webUrl: env.AIEVO_WEB_URL,
    gitAuthorEmail: env.AIEVO_GIT_AUTHOR_EMAIL,
  },
};

await cleanUpOrphans({
  db,
  workDir: env.AIEVO_WORKDIR,
  removeSandboxContainers: () => removeSandboxContainers(docker),
  logger,
});

const queue = await createRunQueue({
  connectionString: env.DATABASE_URL,
  role: 'worker',
  onError: (error) => logger.error({ err: error }, 'Run queue error'),
});
const shutdown = new AbortController();

await queue.startRunWorker(
  (job, jobSignal) => executeRun(job.runId, deps, AbortSignal.any([shutdown.signal, jobSignal])),
  { concurrency: env.AIEVO_WORKER_CONCURRENCY },
);
logger.info(
  { workDir: env.AIEVO_WORKDIR, image: env.AIEVO_SANDBOX_IMAGE },
  'AIEvo worker waiting for runs',
);

function stop(signal: NodeJS.Signals): void {
  if (shutdown.signal.aborted) return;
  logger.info({ signal }, 'Shutting down');
  // Running runs end as `failed` (worker_shutdown) and clean up their sandboxes.
  shutdown.abort();
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS + 5_000).unref();
  void queue
    .stop({ timeoutMs: SHUTDOWN_TIMEOUT_MS })
    .then(close)
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
