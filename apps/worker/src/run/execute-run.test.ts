import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import {
  claimRun,
  getRun,
  listRunSteps,
  listStepToolCalls,
  requestRunCancel,
  schema,
} from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { LocalGitError } from '@aievo/git';
import { SandboxError } from '@aievo/sandbox';
import { createSecretBox } from '@aievo/shared/crypto';
import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newRun, newTask, setupRun } from '../test/fixtures.js';
import type { RunFixture } from '../test/fixtures.js';
import { executeRun, runDir } from './execute-run.js';
import { createGitTokenOpener } from './git-token.js';

let fx: RunFixture;
const noShutdown = new AbortController().signal;

beforeEach(async () => {
  fx = await setupRun();
});

afterEach(async () => {
  await rm(fx.workDir, { recursive: true, force: true });
});

afterAll(closeTestDb);

const execute = (signal = noShutdown, runId = fx.run.id) => executeRun(runId, fx.deps, signal);

async function currentRun() {
  const run = await getRun(fx.db, fx.workspaceId, fx.run.id);
  if (!run) throw new Error('Run not found');
  return run;
}

async function steps() {
  return listRunSteps(fx.db, fx.workspaceId, fx.run.id);
}

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Every stored row of runs, steps and tool calls as one string. */
async function storedRunData(): Promise<string> {
  const rows = await Promise.all([
    fx.db.select().from(schema.run),
    fx.db.select().from(schema.step),
    fx.db.select().from(schema.toolCall),
  ]);
  return JSON.stringify(rows);
}

describe('executeRun', () => {
  it('prepares the run, runs the tests as the check step and succeeds', async () => {
    fx.sandboxes.commands['npm test'] = { exitCode: 0, output: '12 tests passed', durationMs: 900 };

    const outcome = await execute();

    expect(outcome).toBeUndefined();
    const run = await currentRun();
    expect(run).toMatchObject({
      status: 'succeeded',
      error: null,
      branch: `agent/${fx.task.id.replace(/-/g, '').slice(0, 8)}-dodaj-logowanie`,
    });
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.endedAt).toBeInstanceOf(Date);

    expect(fx.git.clones).toEqual([
      expect.objectContaining({
        url: 'https://github.com/octocat/playground.git',
        branch: 'main',
        token: fx.token,
        dir: expect.stringContaining(fx.run.id),
      }),
    ]);
    expect(fx.sandboxes.inputs[0]).toMatchObject({
      runId: fx.run.id,
      limits: fx.deps.config.limits,
    });
    expect(fx.sandboxes.last?.commands).toEqual(['npm ci', 'npm test']);

    const [step] = await steps();
    expect(step).toMatchObject({
      stepKey: 'check',
      agentKey: 'diagnostic',
      status: 'succeeded',
      input: { command: 'npm test' },
      output: { exitCode: 0, timedOut: false, truncated: false },
    });
    expect(await listStepToolCalls(fx.db, fx.workspaceId, step!.id)).toEqual([
      expect.objectContaining({
        tool: 'run_command',
        args: { command: 'npm test' },
        result: '12 tests passed',
        isError: false,
        exitCode: 0,
        durationMs: 900,
      }),
    ]);
  });

  it('cleans up the sandbox and the working directory', async () => {
    await execute();

    expect(fx.sandboxes.last?.stopped).toBe(1);
    expect(existsSync(runDir(fx.workDir, fx.run.id))).toBe(false);
  });

  it('never stores the token', async () => {
    fx.sandboxes.commands['npm test'] = { exitCode: 1, output: `echoed ${fx.token}` };

    await execute();

    expect(await storedRunData()).not.toContain(fx.token);
  });

  it('fails when the tests fail and keeps their output', async () => {
    fx.sandboxes.commands['npm test'] = { exitCode: 1, output: 'FAIL src/a.test.ts\n1 failed' };

    await execute();

    const run = await currentRun();
    expect(run.status).toBe('failed');
    expect(run.error).toEqual({
      code: 'tests_failed',
      message: 'Test command `npm test` exited with code 1:\nFAIL src/a.test.ts\n1 failed',
    });
    const [step] = await steps();
    expect(step?.status).toBe('failed');
    const [call] = await listStepToolCalls(fx.db, fx.workspaceId, step!.id);
    expect(call).toMatchObject({ isError: true, exitCode: 1 });
  });

  it('fails when the tests time out', async () => {
    fx.sandboxes.commands['npm test'] = { exitCode: null, timedOut: true, output: 'waiting' };

    await execute();

    expect((await currentRun()).error).toMatchObject({ code: 'tests_timed_out' });
  });

  it('skips install when the project has no install command', async () => {
    fx = await setupRun({ commands: { test: 'pnpm test' } });

    await execute();

    expect(fx.sandboxes.last?.commands).toEqual(['pnpm test']);
    expect((await currentRun()).status).toBe('succeeded');
  });

  it('fails without a step when install fails', async () => {
    fx.sandboxes.commands['npm ci'] = { exitCode: 1, output: 'npm ERR! missing lockfile' };

    await execute();

    const run = await currentRun();
    expect(run).toMatchObject({ status: 'failed', error: { code: 'install_failed' } });
    expect((run.error as { message: string }).message).toContain('npm ERR! missing lockfile');
    expect(await steps()).toEqual([]);
    expect(fx.sandboxes.last?.stopped).toBe(1);
  });

  it('fails when cloning fails, without starting a sandbox', async () => {
    fx.git.cloneError = new LocalGitError('command_failed', {
      command: 'clone',
      output: 'fatal: repository not found',
    });

    await execute();

    const run = await currentRun();
    expect(run).toMatchObject({ status: 'failed', error: { code: 'clone_failed' } });
    expect((run.error as { message: string }).message).toContain('octocat/playground');
    expect(fx.sandboxes.created).toEqual([]);
    expect(existsSync(runDir(fx.workDir, fx.run.id))).toBe(false);
  });

  it('removes the token from any error message', async () => {
    fx.git.cloneError = new Error(`remote said ${fx.token}`);

    await execute();

    expect(await storedRunData()).not.toContain(fx.token);
    expect((await currentRun()).error).toMatchObject({ code: 'clone_failed' });
  });

  it('fails when the sandbox does not start', async () => {
    fx.sandboxes.createError = new SandboxError('image_missing');

    await execute();

    const run = await currentRun();
    expect(run).toMatchObject({ status: 'failed', error: { code: 'sandbox_failed' } });
    expect((run.error as { message: string }).message).toContain('pnpm sandbox:build');
  });

  it('fails when the stored token cannot be decrypted', async () => {
    fx.deps.openGitToken = createGitTokenOpener(fx.db, createSecretBox(randomBytes(32)));

    await execute();

    expect((await currentRun()).error).toMatchObject({ code: 'git_token_unreadable' });
    expect(fx.git.clones).toEqual([]);
  });

  it('fails an unexpected error as internal_error and still cleans up', async () => {
    fx.sandboxes.stopError = new Error('docker went away');
    fx.deps.sandboxes = {
      create: async (input) => {
        const sandbox = await fx.sandboxes.create(input);
        sandbox.exec = () => Promise.reject(new Error('socket hang up'));
        return sandbox;
      },
    };

    await execute();

    expect((await currentRun()).error).toEqual({
      code: 'internal_error',
      message: 'The run failed with an unexpected error',
    });
    expect(fx.sandboxes.last?.stopped).toBe(1);
    expect(existsSync(runDir(fx.workDir, fx.run.id))).toBe(false);
  });

  it('is cancelled while preparing', async () => {
    fx.git.hangOnClone = true;

    const running = execute();
    await waitFor(() => fx.git.clones.length === 1);
    await requestRunCancel(fx.db, fx.workspaceId, fx.run.id);
    await running;

    expect(await currentRun()).toMatchObject({ status: 'cancelled', error: null });
    expect(fx.sandboxes.created).toEqual([]);
  });

  it('is cancelled while the tests run, stopping the sandbox', async () => {
    fx.sandboxes.commands['npm test'] = 'hang';

    const running = execute();
    await waitFor(() => fx.sandboxes.last?.commands.includes('npm test') === true);
    await requestRunCancel(fx.db, fx.workspaceId, fx.run.id);
    await running;

    expect(await currentRun()).toMatchObject({ status: 'cancelled', error: null });
    const [step] = await steps();
    expect(step?.status).toBe('cancelled');
    expect(fx.sandboxes.last?.stopped).toBe(1);
    expect(existsSync(runDir(fx.workDir, fx.run.id))).toBe(false);
  });

  it('fails when the run exceeds its time limit', async () => {
    fx.deps.config.maxRunMs = 200;
    fx.sandboxes.commands['npm test'] = 'hang';

    await execute();

    expect(await currentRun()).toMatchObject({
      status: 'failed',
      error: { code: 'run_timeout', message: 'The run exceeded its time limit' },
    });
    expect(fx.sandboxes.last?.stopped).toBe(1);
  });

  it('fails with worker_shutdown when the worker stops', async () => {
    fx.sandboxes.commands['npm test'] = 'hang';
    const shutdown = new AbortController();

    const running = execute(shutdown.signal);
    await waitFor(() => fx.sandboxes.last?.commands.includes('npm test') === true);
    shutdown.abort();
    await running;

    expect((await currentRun()).error).toMatchObject({ code: 'worker_shutdown' });
    expect(fx.sandboxes.last?.stopped).toBe(1);
  });

  it('waits in the queue while another run of the project is active', async () => {
    const other = await newRun(
      fx.db,
      fx.workspaceId,
      (await newTask(fx.db, fx.workspaceId, fx.project.id, 'Other')).id,
    );
    await claimRun(fx.db, other.id, 1);

    const outcome = await execute();

    expect(outcome).toEqual({ retryAfterSeconds: 15 });
    expect((await currentRun()).status).toBe('queued');
    expect(fx.git.clones).toEqual([]);
  });

  it('drops a run cancelled while it was queued', async () => {
    await requestRunCancel(fx.db, fx.workspaceId, fx.run.id);

    const outcome = await execute();

    expect(outcome).toBeUndefined();
    expect((await currentRun()).status).toBe('cancelled');
    expect(fx.git.clones).toEqual([]);
  });
});
