import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import {
  claimRun,
  getRun,
  getTask,
  listRunSteps,
  listStepToolCalls,
  requestRunCancel,
  schema,
  updateTask,
} from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { GitError, LocalGitError } from '@aievo/git';
import { ProviderError } from '@aievo/llm';
import { SandboxError } from '@aievo/sandbox';
import { createSecretBox } from '@aievo/shared/crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { finishCall, newRun, newTask, setupRun } from '../test/fixtures.js';
import type { RunFixture } from '../test/fixtures.js';
import { allowedCommands, executeRun, runDir } from './execute-run.js';
import { createGitTokenOpener } from './git-token.js';
import { RunFailure } from './run-failure.js';

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

async function taskStatus() {
  return (await getTask(fx.db, fx.workspaceId, fx.task.id))?.status;
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
  it('runs the agent, checks the tests, commits, pushes and opens a pull request', async () => {
    fx.sandboxes.commands['npm test'] = { exitCode: 0, output: '12 tests passed', durationMs: 900 };

    const outcome = await execute();

    expect(outcome).toBeUndefined();
    const branch = `agent/${fx.task.id.replace(/-/g, '').slice(0, 8)}-dodaj-logowanie`;
    const run = await currentRun();
    expect(run).toMatchObject({
      status: 'succeeded',
      error: null,
      branch,
      prUrl: 'https://github.com/octocat/playground/pull/7',
      prNumber: 7,
      // One scripted response: 100 input and 20 output tokens at 3 / 15 USD per million.
      tokensIn: 100,
      tokensOut: 20,
      costUsd: 0.0006,
    });
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.endedAt).toBeInstanceOf(Date);
    expect(await taskStatus()).toBe('in_review');

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

    expect(fx.git.commits).toEqual([
      expect.objectContaining({
        author: { name: 'AIEvo Programista', email: 'agent@aievo.local' },
        message: expect.stringMatching(
          new RegExp(
            `^Dodaj logowanie\n\nAIEvo-Task: ${fx.task.id}\nAIEvo-Run: ${fx.run.id}\nAIEvo-Agent: coder@sha256:[0-9a-f]{12}$`,
          ),
        ),
      }),
    ]);
    expect(fx.git.pushes).toEqual([
      expect.objectContaining({ branch, baseBranch: 'main', token: fx.token }),
    ]);
    expect(fx.github.tokens).toEqual([fx.token]);
    const [pr] = fx.github.pullRequests;
    expect(pr).toMatchObject({
      owner: 'octocat',
      repo: 'playground',
      head: branch,
      base: 'main',
      title: 'Dodaj logowanie',
    });
    expect(pr?.body).toContain('Added sum(a, b) to src/math.ts with tests.');
    expect(pr?.body).toContain('- `README.md` (modified)');
    expect(pr?.body).toContain('`npm test` ✅ passed');
    expect(pr?.body).toContain(`http://127.0.0.1:5173/runs/${fx.run.id}`);

    const [implement, check] = await steps();
    expect(implement).toMatchObject({
      stepKey: 'implement',
      agentKey: 'coder',
      agentVersion: expect.stringMatching(/^sha256:[0-9a-f]{12}$/),
      status: 'succeeded',
      input: { model: 'claude-test', limits: { maxIterations: 30, maxCostUsd: 5 } },
      output: { result: { summary: 'Added sum(a, b) to src/math.ts with tests.' } },
      tokensIn: 100,
      tokensOut: 20,
    });
    expect(await listStepToolCalls(fx.db, fx.workspaceId, implement!.id)).toEqual([
      expect.objectContaining({ tool: 'finish', isError: false }),
    ]);
    expect(check).toMatchObject({
      stepKey: 'check',
      agentKey: 'platform',
      status: 'succeeded',
      input: { command: 'npm test' },
      output: { exitCode: 0, timedOut: false, truncated: false },
    });
    expect(await listStepToolCalls(fx.db, fx.workspaceId, check!.id)).toEqual([
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

  it('gives the agent the task, the project commands, the limits and the protected tests', async () => {
    fx = await setupRun({
      commands: { install: 'npm ci', lint: 'npm run lint', test: 'npm test', dev: 'npm run dev' },
      settings: { limits: { maxIterations: 12, maxRunCostUsd: 2 } },
    });
    await updateTask(fx.db, fx.workspaceId, fx.task.id, {
      description: 'Add a sum function',
      acceptanceCriteria: '- sums two numbers\n- has tests',
    });

    await execute();

    const [request] = fx.agent.clients[0]?.requests ?? [];
    expect(request?.model).toBe('claude-test');
    expect(request?.system).toContain('# Role: Programista');
    expect(request?.messages[0]?.content).toContain(
      '## Acceptance criteria\n- sums two numbers\n- has tests',
    );
    expect(request?.tools?.map((tool) => tool.name)).toEqual([
      'list_files',
      'read_file',
      'search_code',
      'write_file',
      'edit_file',
      'run_command',
      'git_diff',
      'finish',
    ]);
    const [implement] = await steps();
    expect(implement?.input).toEqual({
      model: 'claude-test',
      limits: { maxIterations: 12, maxCostUsd: 2 },
    });
  });

  it('opens the pull request also when the tests fail, and says so', async () => {
    fx.sandboxes.commands['npm test'] = { exitCode: 1, output: 'FAIL src/a.test.ts\n1 failed' };

    await execute();

    expect(await currentRun()).toMatchObject({ status: 'succeeded', prNumber: 7 });
    const check = (await steps()).at(-1);
    expect(check).toMatchObject({ stepKey: 'check', status: 'failed' });
    const [call] = await listStepToolCalls(fx.db, fx.workspaceId, check!.id);
    expect(call).toMatchObject({ isError: true, exitCode: 1 });
    expect(fx.github.pullRequests[0]?.body).toContain('❌ failed (exit code 1)');
    expect(fx.github.pullRequests[0]?.body).toContain('1 failed');
  });

  it('reports tests that time out in the pull request', async () => {
    fx.sandboxes.commands['npm test'] = { exitCode: null, timedOut: true, output: 'waiting' };

    await execute();

    expect(fx.github.pullRequests[0]?.body).toContain('❌ timed out');
  });

  it('fails without a pull request when the agent changed nothing', async () => {
    fx.git.commitSha = null;

    await execute();

    expect(await currentRun()).toMatchObject({
      status: 'failed',
      prUrl: null,
      error: { code: 'no_changes' },
    });
    expect(fx.git.pushes).toEqual([]);
    expect(fx.github.pullRequests).toEqual([]);
    expect(await taskStatus()).toBe('needs_human');
    // Nothing to check either: the platform's tests run only on a commit.
    expect(fx.sandboxes.last?.commands).toEqual(['npm ci']);
  });

  it('puts back tracked files the install command rewrote', async () => {
    fx.git.working = [[{ status: 'modified', path: 'package-lock.json' }]];

    await execute();

    expect(fx.git.restores).toEqual([{ ref: 'HEAD', paths: ['package-lock.json'] }]);
    expect((await currentRun()).status).toBe('succeeded');
  });

  it('stops before the agent when install creates files .gitignore does not cover', async () => {
    fx.git.working = [
      [
        { status: 'added', path: '.cache/a.bin' },
        { status: 'modified', path: 'package-lock.json' },
      ],
    ];

    await execute();

    const run = await currentRun();
    expect(run).toMatchObject({ status: 'failed', error: { code: 'install_changed_files' } });
    expect((run.error as { message: string }).message).toContain('.cache/a.bin');
    expect(fx.agent.clients[0]?.requests).toEqual([]);
    expect(fx.git.commits).toEqual([]);
  });

  it('puts back existing tests the agent changed through commands, and says so', async () => {
    fx.git.working = [
      [],
      [
        { status: 'modified', path: 'src/App.test.tsx' },
        { status: 'deleted', path: 'tests/old.spec.ts' },
        { status: 'added', path: 'src/sum.test.ts' },
        { status: 'modified', path: 'src/math.ts' },
      ],
    ];

    await execute();

    expect(fx.git.restores).toEqual([
      { ref: 'HEAD', paths: ['src/App.test.tsx', 'tests/old.spec.ts'] },
    ]);
    const body = fx.github.pullRequests[0]?.body ?? '';
    expect(body).toContain('## Existing tests restored');
    expect(body).toContain('- `src/App.test.tsx`\n- `tests/old.spec.ts`');
  });

  it('fails the step and the run when the model fails, and hands the task to a human', async () => {
    fx.agent.script = [{ error: new ProviderError('unauthorized', 401) }];

    await execute();

    const run = await currentRun();
    expect(run).toMatchObject({ status: 'failed', error: { code: 'model_error' } });
    expect((await steps()).map((step) => [step.stepKey, step.status])).toEqual([
      ['implement', 'failed'],
    ]);
    expect(fx.git.commits).toEqual([]);
    expect(await taskStatus()).toBe('needs_human');
  });

  it('stops at the run cost limit and names it', async () => {
    fx = await setupRun({ settings: { limits: { maxRunCostUsd: 0.001 } } });
    const read = { name: 'list_files', input: {} };
    // 200 × 3 + 40 × 15 USD per million tokens = 0.0012 USD, over the limit at once.
    const expensive = { toolCalls: [read], usage: { inputTokens: 200, outputTokens: 40 } };
    fx.agent.script = [expensive, finishCall()];

    await execute();

    const run = await currentRun();
    expect(run).toMatchObject({ status: 'failed', error: { code: 'cost_limit' } });
    expect((run.error as { message: string }).message).toBe(
      'The run cost 0.0012 USD, over its limit of 0.001 USD.',
    );
    expect(run.costUsd).toBeCloseTo(0.0012);
    // Over the budget nothing else runs, not even the model's next answer.
    expect(fx.agent.clients[0]?.remaining).toBe(1);
    expect(fx.github.pullRequests).toEqual([]);
  });

  it('stops at the iteration limit of the project', async () => {
    fx = await setupRun({ settings: { limits: { maxIterations: 1 } } });
    fx.agent.script = [{ text: 'Thinking…' }];

    await execute();

    expect((await currentRun()).error).toMatchObject({ code: 'iteration_limit' });
  });

  it('fails before cloning when no model is chosen for the agent', async () => {
    fx.deps.openAgentModel = () =>
      Promise.reject(new RunFailure('agent_model_missing', 'No model is chosen'));

    await execute();

    expect(await currentRun()).toMatchObject({
      status: 'failed',
      error: { code: 'agent_model_missing', message: 'No model is chosen' },
    });
    expect(fx.git.clones).toEqual([]);
    expect(await taskStatus()).toBe('needs_human');
  });

  it('fails when the push is rejected', async () => {
    fx.git.pushError = new LocalGitError('command_failed', {
      command: 'push',
      output: `rejected ${fx.token}`,
    });

    await execute();

    const run = await currentRun();
    expect(run).toMatchObject({ status: 'failed', error: { code: 'push_failed' } });
    expect(fx.github.pullRequests).toEqual([]);
    expect(await storedRunData()).not.toContain(fx.token);
  });

  it('fails when the pull request cannot be opened after the push', async () => {
    fx.github.error = new GitError('validation', { status: 422 });

    await execute();

    const run = await currentRun();
    expect(run).toMatchObject({ status: 'failed', prUrl: null, error: { code: 'pr_failed' } });
    expect((run.error as { message: string }).message).toMatch(/was pushed/);
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
    expect(fx.github.pullRequests[0]?.body).not.toContain(fx.token);
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
    expect(await taskStatus()).toBe('ready');
  });

  it('is cancelled while the agent waits for the model', async () => {
    fx.agent.script = [{ hang: true }];

    const running = execute();
    await waitFor(() => fx.agent.clients[0]?.requests.length === 1);
    await requestRunCancel(fx.db, fx.workspaceId, fx.run.id);
    await running;

    expect(await currentRun()).toMatchObject({ status: 'cancelled', error: null });
    expect((await steps()).map((step) => [step.stepKey, step.status])).toEqual([
      ['implement', 'cancelled'],
    ]);
    expect(fx.git.commits).toEqual([]);
  });

  it('is cancelled while the tests run, stopping the sandbox', async () => {
    fx.sandboxes.commands['npm test'] = 'hang';

    const running = execute();
    await waitFor(() => fx.sandboxes.last?.commands.includes('npm test') === true);
    await requestRunCancel(fx.db, fx.workspaceId, fx.run.id);
    await running;

    expect(await currentRun()).toMatchObject({ status: 'cancelled', error: null });
    expect((await steps()).at(-1)).toMatchObject({ stepKey: 'check', status: 'cancelled' });
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

  it('fails when the agent outlives the run time limit', async () => {
    fx.deps.config.maxRunMs = 200;
    fx.agent.script = [{ hang: true }];

    await execute();

    expect((await currentRun()).error).toMatchObject({ code: 'run_timeout' });
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

describe('allowedCommands', () => {
  it('allows arguments except for install and leaves out dev', () => {
    expect(
      allowedCommands({
        install: 'npm ci',
        build: 'npm run build',
        lint: 'npm run lint',
        test: 'npm test',
        coverage: 'npm run test:coverage',
        dev: 'npm run dev',
      }),
    ).toEqual([
      { command: 'npm ci', allowArgs: false },
      { command: 'npm run build', allowArgs: true },
      { command: 'npm run lint', allowArgs: true },
      { command: 'npm test', allowArgs: true },
      { command: 'npm run test:coverage', allowArgs: true },
    ]);
    expect(allowedCommands({ test: 'npm test' })).toEqual([
      { command: 'npm test', allowArgs: true },
    ]);
  });
});
