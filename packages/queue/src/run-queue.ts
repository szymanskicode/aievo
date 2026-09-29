import { PgBoss } from 'pg-boss';

/** Name of the pg-boss queue with one job per run. */
export const RUN_QUEUE = 'run';

/**
 * A job may stay active this long before pg-boss gives up on it. Runs enforce their own,
 * shorter time limit; this only has to be longer than any of them.
 */
const RUN_JOB_EXPIRE_SECONDS = 6 * 60 * 60;

export interface RunJob {
  runId: string;
}

/**
 * `retryAfterSeconds` puts the run back in the queue for later (e.g. its project already has
 * as many active runs as allowed); anything else completes the job.
 */
export type RunJobOutcome = { retryAfterSeconds: number } | undefined;

/**
 * Executes one run. It must not throw for failures of the run itself: those end up in the run's
 * status. `signal` aborts when the queue stops or loses the job.
 */
export type RunJobHandler = (job: RunJob, signal: AbortSignal) => Promise<RunJobOutcome>;

/** The part of the queue the API needs: putting runs in it. */
export interface RunQueue {
  enqueueRun(runId: string): Promise<void>;
}

export interface RunWorkerOptions {
  /** Runs this process executes at the same time. */
  concurrency?: number;
  pollingIntervalSeconds?: number;
}

export interface RunQueueClient extends RunQueue {
  startRunWorker(handler: RunJobHandler, options?: RunWorkerOptions): Promise<void>;
  /** Stops polling and waits up to `timeoutMs` for running handlers; closes the connections. */
  stop(options?: { timeoutMs?: number }): Promise<void>;
}

export interface RunQueueOptions {
  connectionString: string;
  /** Background errors of pg-boss (lost connection, failed maintenance). */
  onError?: (error: Error) => void;
  /** Maintenance and supervision only in the worker; the API only sends jobs. */
  role: 'api' | 'worker';
}

export async function createRunQueue(options: RunQueueOptions): Promise<RunQueueClient> {
  const worker = options.role === 'worker';
  const boss = new PgBoss({
    connectionString: options.connectionString,
    application_name: `aievo-${options.role}`,
    max: worker ? 4 : 2,
    schedule: false,
    supervise: worker,
  });
  boss.on('error', (error: Error) => options.onError?.(error));
  await boss.start();
  await boss.createQueue(RUN_QUEUE, {
    // A run never repeats on its own; a failed run is re-run by the user.
    retryLimit: 0,
    expireInSeconds: RUN_JOB_EXPIRE_SECONDS,
  });

  const enqueueRun = async (runId: string, startAfterSeconds?: number): Promise<void> => {
    const data: RunJob = { runId };
    const id = await boss.send(
      RUN_QUEUE,
      data,
      startAfterSeconds === undefined ? {} : { startAfter: startAfterSeconds },
    );
    if (id === null) throw new Error(`Run ${runId} was not queued`);
  };

  return {
    enqueueRun: (runId) => enqueueRun(runId),

    async startRunWorker(handler, workerOptions = {}) {
      await boss.work<RunJob>(
        RUN_QUEUE,
        {
          batchSize: 1,
          localConcurrency: workerOptions.concurrency ?? 1,
          pollingIntervalSeconds: workerOptions.pollingIntervalSeconds ?? 2,
        },
        async (jobs) => {
          for (const job of jobs) {
            const outcome = await handler(job.data, job.signal);
            // Re-queued as a new job, so waiting does not use up the job's retries or expiry.
            if (outcome) await enqueueRun(job.data.runId, outcome.retryAfterSeconds);
          }
        },
      );
    },

    async stop({ timeoutMs = 30_000 } = {}) {
      await boss.stop({ graceful: true, timeout: timeoutMs, close: true });
    },
  };
}
