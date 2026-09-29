import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { TempDirSandbox } from '@aievo/agent-runtime/testing';
import type { ExecHandler } from '@aievo/agent-runtime/testing';
import { getRun, getTask, listRunSteps, listStepToolCalls, updateTask } from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { createGitHubProvider, createLocalGit } from '@aievo/git';
import type { SandboxFactory } from '@aievo/sandbox';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CODER_RESULT, setupRun } from '../test/fixtures.js';
import type { RunFixture } from '../test/fixtures.js';
import { executeRun } from './execute-run.js';

/**
 * The whole run against real git: a bare repository stands in for GitHub's git side, the
 * sandbox is a directory on the host (commands are scripted, except `git`, which really
 * runs), the model is scripted and the GitHub API is mocked with msw.
 */

const GITHUB_API = 'https://api.github.test';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
afterAll(closeTestDb);

let root: string;
let fx: RunFixture;
let remote: string;
let pullRequests: Record<string, unknown>[];

/** Runs git isolated from the user's and the system's config. */
function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-c', 'user.name=Seed', '-c', 'user.email=seed@example.com', ...args],
      {
        cwd,
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: path.join(root, 'no-gitconfig'),
        },
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) reject(Object.assign(new Error(stderr), { code: error.code }));
        else resolve(stdout);
      },
    );
  });
}

/** Splits a command like the sandbox shell would, for the simple quoting the tools use. */
function splitCommand(command: string): string[] {
  return [...command.matchAll(/'([^']*)'|(\S+)/g)].map((match) => match[1] ?? match[2] ?? '');
}

/** `octocat/playground.git` with `package.json`, `src/math.ts` and its test on `main`. */
async function seedRemote(hostDir: string): Promise<string> {
  const bare = path.join(hostDir, 'octocat', 'playground.git');
  const seed = path.join(root, 'seed');
  await mkdir(path.join(seed, 'src'), { recursive: true });
  await git(['init', '--bare', '--initial-branch=main', bare], root);
  await git(['init', '--initial-branch=main', seed], root);
  await writeFile(
    path.join(seed, 'package.json'),
    '{ "name": "playground", "scripts": { "test": "vitest run" } }\n',
  );
  await writeFile(
    path.join(seed, 'src', 'math.ts'),
    'export function double(a: number): number {\n  return a * 2;\n}\n',
  );
  await writeFile(
    path.join(seed, 'src', 'math.test.ts'),
    "import { double } from './math';\n\nit('doubles', () => expect(double(2)).toBe(4));\n",
  );
  await git(['add', '.'], seed);
  await git(['commit', '-m', 'init'], seed);
  await git(['push', bare, 'main'], seed);
  return bare;
}

/** A sandbox factory on the run's working copy; `npm` is scripted, `git` really runs there. */
function hostSandboxes(
  sandboxes: TempDirSandbox[],
  /** Commands that change files in the working copy, by their exact text. */
  effects: Record<string, (dir: string) => Promise<void>> = {},
): SandboxFactory {
  return {
    create: ({ workspaceDir }) => {
      const handler: ExecHandler = async (command) => {
        const result = { timedOut: false, truncated: false, durationMs: 3 };
        const effect = effects[command];
        if (effect) {
          await effect(workspaceDir);
          return { ...result, exitCode: 0, output: 'done' };
        }
        if (command.startsWith('git ')) {
          try {
            const output = await git(splitCommand(command).slice(1), workspaceDir);
            return { ...result, exitCode: 0, output };
          } catch (error) {
            const code = (error as { code?: unknown }).code;
            return {
              ...result,
              exitCode: typeof code === 'number' ? code : 1,
              output: (error as Error).message,
            };
          }
        }
        if (command === 'npm ci') return { ...result, exitCode: 0, output: 'added 1 package' };
        if (command.startsWith('npm test')) {
          return { ...result, exitCode: 0, output: 'Test Files 2 passed\nTests 3 passed' };
        }
        return { ...result, exitCode: 127, output: `${command}: not found` };
      };
      const sandbox = new TempDirSandbox(workspaceDir, handler);
      sandboxes.push(sandbox);
      return Promise.resolve(sandbox);
    },
  };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'aievo-flow-'));
  const hostDir = path.join(root, 'host');
  remote = await seedRemote(hostDir);
  fx = await setupRun({ config: { gitHostUrl: hostDir.split(path.sep).join('/') } });
  await updateTask(fx.db, fx.workspaceId, fx.task.id, {
    title: 'Dodaj funkcję sum(a, b)',
    description: 'Add `sum(a, b)` to `src/math.ts`.',
    acceptanceCriteria: '- sum(2, 3) returns 5\n- sum has tests',
  });
  fx.deps.git = await createLocalGit({ stateDir: path.join(root, 'git-state') });
  fx.deps.gitProvider = (token) => createGitHubProvider(token, { baseUrl: GITHUB_API });

  pullRequests = [];
  server.use(
    http.post(`${GITHUB_API}/repos/octocat/playground/pulls`, async ({ request }) => {
      pullRequests.push({
        ...((await request.json()) as Record<string, unknown>),
        authorization: request.headers.get('authorization'),
      });
      return HttpResponse.json(
        { number: 12, html_url: 'https://github.com/octocat/playground/pull/12' },
        { status: 201 },
      );
    }),
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
  await rm(fx.workDir, { recursive: true, force: true, maxRetries: 5 });
});

describe('a run end to end', { timeout: 60_000 }, () => {
  it('turns the agent work into a commit on the agent branch and a pull request', async () => {
    const sandboxes: TempDirSandbox[] = [];
    fx.deps.sandboxes = hostSandboxes(sandboxes);
    fx.agent.script = [
      { toolCalls: [{ name: 'read_file', input: { path: 'src/math.ts' } }] },
      {
        toolCalls: [
          {
            name: 'edit_file',
            input: {
              path: 'src/math.ts',
              find: '  return a * 2;\n}\n',
              replace:
                '  return a * 2;\n}\n\nexport function sum(a: number, b: number): number {\n  return a + b;\n}\n',
            },
          },
          {
            name: 'write_file',
            input: {
              path: 'src/sum.test.ts',
              content:
                "import { sum } from './math';\n\nit('adds', () => expect(sum(2, 3)).toBe(5));\n",
            },
          },
          // An existing test is protected: this write must be refused.
          {
            name: 'write_file',
            input: { path: 'src/math.test.ts', content: 'it.skip("gone", () => {});\n' },
          },
        ],
      },
      { toolCalls: [{ name: 'run_command', input: { command: 'npm test' } }] },
      {
        toolCalls: [
          {
            name: 'finish',
            input: {
              ...CODER_RESULT,
              openIssues: ['src/math.test.ts could cover negative numbers'],
            },
          },
        ],
      },
    ];

    await executeRun(fx.run.id, fx.deps, new AbortController().signal);

    const run = await getRun(fx.db, fx.workspaceId, fx.run.id);
    const branch = `agent/${fx.task.id.replace(/-/g, '').slice(0, 8)}-dodaj-funkcje-sum-a-b`;
    expect(run).toMatchObject({
      status: 'succeeded',
      error: null,
      branch,
      prNumber: 12,
      prUrl: 'https://github.com/octocat/playground/pull/12',
      tokensIn: 400,
      tokensOut: 80,
    });
    expect(run?.costUsd).toBeCloseTo(0.0024);
    expect((await getTask(fx.db, fx.workspaceId, fx.task.id))?.status).toBe('in_review');

    // The commit on the remote agent branch, with the agent as its author.
    const log = await git(['log', '--format=%an <%ae>%n%s%n%b', '-1', branch], remote);
    expect(log).toContain('AIEvo Programista <agent@aievo.local>');
    expect(log).toContain('Dodaj funkcję sum(a, b)');
    expect(log).toContain(`AIEvo-Run: ${fx.run.id}`);
    expect(
      (await git(['diff', '--name-status', `main...${branch}`], remote)).trim().split('\n'),
    ).toEqual(['M\tsrc/math.ts', 'A\tsrc/sum.test.ts']);
    expect(await git(['show', `${branch}:src/math.ts`], remote)).toContain(
      'export function sum(a: number, b: number): number',
    );
    expect(await git(['show', `${branch}:src/math.test.ts`], remote)).toContain("it('doubles'");
    // The base branch is untouched.
    expect((await git(['rev-list', '--count', 'main'], remote)).trim()).toBe('1');

    // The pull request.
    expect(pullRequests).toHaveLength(1);
    const [pr] = pullRequests;
    expect(pr).toMatchObject({
      head: branch,
      base: 'main',
      title: 'Dodaj funkcję sum(a, b)',
      authorization: `token ${fx.token}`,
    });
    const body = String(pr?.body);
    expect(body).toContain('## Task\n\n**Dodaj funkcję sum(a, b)**');
    expect(body).toContain('### Acceptance criteria\n\n- sum(2, 3) returns 5\n- sum has tests');
    expect(body).toContain('## Summary\n\nAdded sum(a, b) to src/math.ts with tests.');
    expect(body).toContain(
      '## Changed files (2)\n\n- `src/math.ts` (modified)\n- `src/sum.test.ts` (added)',
    );
    expect(body).toContain('`npm test` ✅ passed');
    expect(body).toContain('Tests 3 passed');
    expect(body).toContain('## Open issues\n\n- src/math.test.ts could cover negative numbers');
    expect(body).toContain('- Iterations: 4');
    expect(body).toContain('- Tokens: 400 in, 80 out');
    expect(body).toContain('- Cost: 0.0024 USD');
    expect(body).toContain(`- Details: http://127.0.0.1:5173/runs/${fx.run.id}`);

    // Every tool call is recorded, the refused write as an error.
    const [implement, check] = await listRunSteps(fx.db, fx.workspaceId, fx.run.id);
    const calls = await listStepToolCalls(fx.db, fx.workspaceId, implement!.id);
    expect(calls.map((call) => [call.tool, call.isError])).toEqual([
      ['read_file', false],
      ['edit_file', false],
      ['write_file', false],
      ['write_file', true],
      ['run_command', false],
      ['finish', false],
    ]);
    expect(calls[3]?.result).toMatch(/existing test file/);
    expect(check).toMatchObject({ stepKey: 'check', status: 'succeeded' });
    expect(sandboxes[0]?.commands.map((entry) => entry.command)).toEqual([
      'npm ci',
      `git -c 'safe.directory=*' cat-file -e 'origin/main:src/sum.test.ts'`,
      `git -c 'safe.directory=*' cat-file -e 'origin/main:src/math.test.ts'`,
      'npm test',
      'npm test',
    ]);
  });

  it('opens no pull request when the agent changes nothing', async () => {
    fx.deps.sandboxes = hostSandboxes([]);

    await executeRun(fx.run.id, fx.deps, new AbortController().signal);

    expect(await getRun(fx.db, fx.workspaceId, fx.run.id)).toMatchObject({
      status: 'failed',
      error: { code: 'no_changes' },
      prUrl: null,
    });
    expect(pullRequests).toEqual([]);
    expect(await git(['branch', '--list', 'agent/*'], remote)).toBe('');
  });

  it('keeps what install and agent commands did to tracked files and tests out of the commit', async () => {
    fx.deps.sandboxes = hostSandboxes([], {
      // An install that rewrites a tracked file, like npm reformatting a lockfile.
      'npm ci': (dir) => writeFile(path.join(dir, 'package.json'), '{ "rewritten": true }\n'),
      // Updating snapshots rewrites an existing test, which the file tools would refuse.
      'npm test -- -u': (dir) =>
        writeFile(path.join(dir, 'src', 'math.test.ts'), "it('passes', () => {});\n"),
    });
    fx.agent.script = [
      {
        toolCalls: [
          {
            name: 'write_file',
            input: {
              path: 'src/sum.ts',
              content: 'export const sum = (a: number, b: number) => a + b;\n',
            },
          },
          { name: 'run_command', input: { command: 'npm test -- -u' } },
        ],
      },
      { toolCalls: [{ name: 'finish', input: CODER_RESULT }] },
    ];

    await executeRun(fx.run.id, fx.deps, new AbortController().signal);

    const run = await getRun(fx.db, fx.workspaceId, fx.run.id);
    expect(run).toMatchObject({ status: 'succeeded', prNumber: 12 });
    const diff = await git(['diff', '--name-status', `main...${run?.branch ?? ''}`], remote);
    expect(diff.trim()).toBe('A\tsrc/sum.ts');
    const body = String(pullRequests[0]?.body);
    expect(body).toContain(
      '## Existing tests restored\n\nCommands the agent ran changed these existing test files.',
    );
    expect(body).toContain('- `src/math.test.ts`');
  });

  it('stops when install leaves files that .gitignore does not cover', async () => {
    fx.deps.sandboxes = hostSandboxes([], {
      'npm ci': (dir) => writeFile(path.join(dir, 'install.log'), 'added 1 package\n'),
    });

    await executeRun(fx.run.id, fx.deps, new AbortController().signal);

    const run = await getRun(fx.db, fx.workspaceId, fx.run.id);
    expect(run).toMatchObject({ status: 'failed', error: { code: 'install_changed_files' } });
    expect((run?.error as { message: string }).message).toContain('install.log');
    expect(fx.agent.clients[0]?.requests).toEqual([]);
  });
});
