import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { FakeLlmClient, TempDirSandbox } from '@aievo/agent-runtime/testing';
import type { FakeResponse } from '@aievo/agent-runtime/testing';
import type { Db } from '@aievo/db';
import type { ChatRequest, LlmClient, LlmEvent } from '@aievo/llm';
import { loadAgentPreset } from '@aievo/presets';
import type { SandboxFactory } from '@aievo/sandbox';
import type { CoderResult } from '@aievo/shared';
import type { Logger } from 'pino';

import type { RunnerConfig, RunnerDeps } from '../run/execute-run.js';
import { FakeGitProvider, FakeLocalGit } from '../test/fakes.js';

/** What the scripted Programista adds to the repository. */
export const E2E_FILES = {
  source: 'src/greeting.ts',
  test: 'src/greeting.test.ts',
} as const;

export const E2E_RESULT: CoderResult = {
  summary: 'Added greet(name) with a unit test.',
  changedFiles: [E2E_FILES.source, E2E_FILES.test],
  tests: { commands: ['npm test'], passed: true, summary: '1 test passed' },
  openIssues: [],
};

/** One scripted run of the Programista: look around, write code and a test, test, finish. */
export function e2eScript(): FakeResponse[] {
  return [
    { text: 'Reading the project first.', toolCalls: [{ name: 'list_files', input: {} }] },
    {
      toolCalls: [
        {
          name: 'write_file',
          input: {
            path: E2E_FILES.source,
            content:
              'export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n',
          },
        },
        {
          name: 'write_file',
          input: {
            path: E2E_FILES.test,
            content:
              "import { greet } from './greeting';\n\n" +
              "it('greets', () => expect(greet('Ada')).toBe('Hello, Ada!'));\n",
          },
        },
      ],
    },
    { toolCalls: [{ name: 'run_command', input: { command: 'npm test' } }] },
    { toolCalls: [{ name: 'finish', input: E2E_RESULT }] },
  ];
}

/** Answers like a model that takes a moment, so the UI can show the run while it works. */
class PacedLlmClient implements LlmClient {
  constructor(
    private readonly inner: LlmClient,
    private readonly delayMs: number,
  ) {}

  async *chat(req: ChatRequest): AsyncIterable<LlmEvent> {
    await sleep(this.delayMs, undefined, req.signal ? { signal: req.signal } : {});
    yield* this.inner.chat(req);
  }
}

/** A sandbox on the run's working copy; `npm` commands pass without running anything. */
function hostSandboxes(): SandboxFactory {
  return {
    create: ({ workspaceDir }) =>
      Promise.resolve(
        new TempDirSandbox(workspaceDir, (command) => ({
          exitCode: 0,
          output: command.startsWith('npm test') ? ' ✓ src/greeting.test.ts (1 test)\n' : '',
          timedOut: false,
          truncated: false,
          durationMs: 40,
        })),
      ),
  };
}

export interface E2eDepsInput {
  db: Db;
  logger: Logger;
  workDir: string;
  webUrl: string;
  /** Pause before each model answer. */
  modelDelayMs: number;
}

/**
 * Runner dependencies for E2E tests: the real database, queue and agent loop, with a
 * scripted model, a local working copy instead of a clone and a GitHub that only records
 * pull requests. Only `main.ts` uses it, after `assertE2eMode`.
 */
export function createE2eDeps(input: E2eDepsInput): RunnerDeps {
  const git = new FakeLocalGit();
  git.changed = [
    { status: 'added', path: E2E_FILES.source },
    { status: 'added', path: E2E_FILES.test },
  ];
  const github = new FakeGitProvider();

  const config: RunnerConfig = {
    workDir: input.workDir,
    maxRunMs: 5 * 60_000,
    maxRunsPerProject: 1,
    commandTimeoutMs: 60_000,
    limits: { memoryMb: 512, cpus: 1, pids: 64 },
    busyRetrySeconds: 1,
    cancelPollMs: 500,
    gitHostUrl: 'https://github.invalid',
    webUrl: input.webUrl,
    gitAuthorEmail: 'agent@aievo.local',
  };

  return {
    db: input.db,
    git,
    sandboxes: hostSandboxes(),
    // A random fake: the local git and the GitHub of this worker never send it anywhere.
    openGitToken: () => Promise.resolve(`github_pat_${randomBytes(20).toString('hex')}`),
    openAgentModel: () =>
      Promise.resolve({
        llm: new PacedLlmClient(new FakeLlmClient(e2eScript()), input.modelDelayMs),
        modelId: 'e2e-fake-model',
        displayName: 'E2E fake model',
        pricing: { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
      }),
    gitProvider: github.factory,
    loadAgentPreset: (key) => loadAgentPreset(key),
    logger: input.logger,
    config,
  };
}
