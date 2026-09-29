import { testDatabaseUrl } from '@aievo/db/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { createRunQueue } from './run-queue.js';
import type { RunJob, RunQueueClient } from './run-queue.js';

let clients: RunQueueClient[] = [];

async function newQueue(role: 'api' | 'worker'): Promise<RunQueueClient> {
  const client = await createRunQueue({ connectionString: testDatabaseUrl(), role });
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.map((client) => client.stop({ timeoutMs: 5_000 })));
  clients = [];
});

/** Resolves with the jobs once `count` of them have reached the handler. */
function collect(count: number) {
  const seen: RunJob[] = [];
  let done: (jobs: RunJob[]) => void = () => undefined;
  const all = new Promise<RunJob[]>((resolve) => (done = resolve));
  const record = (job: RunJob) => {
    seen.push(job);
    if (seen.length === count) done(seen);
  };
  return { all, record };
}

describe('run queue', () => {
  it('delivers a run enqueued by the API to the worker', async () => {
    const api = await newQueue('api');
    const worker = await newQueue('worker');
    const { all, record } = collect(1);
    await worker.startRunWorker(
      async (job, signal) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        record(job);
        return undefined;
      },
      { pollingIntervalSeconds: 1 },
    );

    await api.enqueueRun('run-1');

    expect(await all).toEqual([{ runId: 'run-1' }]);
  });

  it('puts a run back in the queue when the handler asks to retry later', async () => {
    const worker = await newQueue('worker');
    const { all, record } = collect(2);
    let calls = 0;
    await worker.startRunWorker(
      async (job) => {
        record(job);
        calls += 1;
        return calls === 1 ? { retryAfterSeconds: 1 } : undefined;
      },
      { pollingIntervalSeconds: 1 },
    );
    const started = Date.now();

    await worker.enqueueRun('run-2');

    expect(await all).toEqual([{ runId: 'run-2' }, { runId: 'run-2' }]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_000);
  });
});
