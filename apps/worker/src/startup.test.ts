import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { claimRun, getRun, requestRunCancel } from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cleanUpOrphans } from './startup.js';
import { newRun, newTask, setupRun } from './test/fixtures.js';
import type { RunFixture } from './test/fixtures.js';

let fx: RunFixture;

beforeEach(async () => {
  fx = await setupRun();
});

afterEach(async () => {
  await rm(fx.workDir, { recursive: true, force: true });
});

afterAll(closeTestDb);

describe('cleanUpOrphans', () => {
  it('fails active runs, removes sandbox containers and run directories', async () => {
    await claimRun(fx.db, fx.run.id, 1);
    const queuedTask = await newTask(fx.db, fx.workspaceId, fx.project.id, 'Queued');
    const queued = await newRun(fx.db, fx.workspaceId, queuedTask.id);
    const doneTask = await newTask(fx.db, fx.workspaceId, fx.project.id, 'Done');
    const done = await newRun(fx.db, fx.workspaceId, doneTask.id);
    await requestRunCancel(fx.db, fx.workspaceId, done.id);
    const leftover = path.join(fx.workDir, 'runs', fx.run.id, 'repo');
    await mkdir(leftover, { recursive: true });
    await writeFile(path.join(leftover, 'file.txt'), 'x');
    let removeCalls = 0;

    await cleanUpOrphans({
      db: fx.db,
      workDir: fx.workDir,
      removeSandboxContainers: () => {
        removeCalls += 1;
        return Promise.resolve(2);
      },
      logger: fx.deps.logger,
    });

    expect(await getRun(fx.db, fx.workspaceId, fx.run.id)).toMatchObject({
      status: 'failed',
      error: { code: 'worker_restarted' },
    });
    expect((await getRun(fx.db, fx.workspaceId, queued.id))?.status).toBe('queued');
    expect((await getRun(fx.db, fx.workspaceId, done.id))?.status).toBe('cancelled');
    expect(removeCalls).toBe(1);
    expect(existsSync(path.join(fx.workDir, 'runs'))).toBe(false);
    expect(existsSync(fx.workDir)).toBe(true);
  });
});
