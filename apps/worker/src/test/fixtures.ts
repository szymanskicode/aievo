import { randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createGitCredential,
  createProject,
  createRun,
  createTask,
  updateProject,
} from '@aievo/db';
import type { Db, Project, Run, Task } from '@aievo/db';
import { createWorkspace, getTestDb, resetDb } from '@aievo/db/testing';
import { FakeLlmClient } from '@aievo/agent-runtime/testing';
import type { FakeResponse } from '@aievo/agent-runtime/testing';
import { loadAgentPreset } from '@aievo/presets';
import { projectSettingsSchema } from '@aievo/shared';
import type { CoderResult, ProjectCommands, ProjectSettingsInput } from '@aievo/shared';
import { createSecretBox, keyHint } from '@aievo/shared/crypto';
import type { SecretBox } from '@aievo/shared/crypto';
import { pino } from 'pino';

import type { RunnerConfig, RunnerDeps } from '../run/execute-run.js';
import { createGitTokenOpener } from '../run/git-token.js';
import { FakeGitProvider, FakeLocalGit, FakeSandboxFactory } from './fakes.js';

export interface RunFixture {
  db: Db;
  workspaceId: string;
  project: Project;
  task: Task;
  run: Run;
  /** The plaintext token stored (encrypted) for the project. */
  token: string;
  secretBox: SecretBox;
  git: FakeLocalGit;
  sandboxes: FakeSandboxFactory;
  github: FakeGitProvider;
  agent: FakeAgent;
  workDir: string;
  deps: RunnerDeps;
}

/** A fake fine-grained GitHub token that exists only inside this test process. */
export function fakeGitHubToken(): string {
  return `github_pat_${randomBytes(20).toString('hex')}`;
}

export async function newTask(db: Db, workspaceId: string, projectId: string, title: string) {
  const task = await createTask(db, workspaceId, projectId, { title });
  if (!task) throw new Error('Task was not created');
  return task;
}

export async function newRun(db: Db, workspaceId: string, taskId: string): Promise<Run> {
  const run = await createRun(db, workspaceId, taskId);
  if (!run) throw new Error('Run was not created');
  return run;
}

/**
 * An empty database with one linked project (install and test commands set), a task, a
 * queued run and runner dependencies built on fakes.
 */
export async function setupRun(
  options: {
    commands?: ProjectCommands;
    settings?: Omit<ProjectSettingsInput, 'commands'>;
    config?: Partial<RunnerConfig>;
  } = {},
): Promise<RunFixture> {
  const db = getTestDb();
  await resetDb(db);
  const workspaceId = await createWorkspace(db);
  const secretBox = createSecretBox(randomBytes(32));
  const token = fakeGitHubToken();
  const credential = await createGitCredential(db, workspaceId, {
    label: 'GitHub',
    encryptedToken: secretBox.encrypt(token),
    tokenHint: keyHint(token),
    githubLogin: 'octocat',
    expiresAt: null,
  });
  const created = await createProject(db, workspaceId, {
    name: 'Playground',
    repoUrl: 'https://github.com/octocat/playground',
    repo: { owner: 'octocat', name: 'playground', gitCredentialId: credential.id },
  });
  const project = await updateProject(db, workspaceId, created.id, {
    settings: projectSettingsSchema.parse({
      ...options.settings,
      commands: options.commands ?? { install: 'npm ci', test: 'npm test' },
    }),
  });
  if (!project) throw new Error('Project was not updated');
  const task = await newTask(db, workspaceId, project.id, 'Dodaj logowanie');
  const run = await newRun(db, workspaceId, task.id);

  const git = new FakeLocalGit();
  const sandboxes = new FakeSandboxFactory();
  const github = new FakeGitProvider();
  const workDir = await mkdtemp(path.join(tmpdir(), 'aievo-worker-'));
  const agent: FakeAgent = { script: [finishCall()], clients: [] };
  const deps: RunnerDeps = {
    db,
    git,
    sandboxes,
    openGitToken: createGitTokenOpener(db, secretBox),
    openAgentModel: () => {
      const llm = new FakeLlmClient(agent.script);
      agent.clients.push(llm);
      return Promise.resolve({
        llm,
        modelId: 'claude-test',
        displayName: 'Claude Test',
        pricing: TEST_PRICING,
      });
    },
    gitProvider: github.factory,
    loadAgentPreset: (key) => loadAgentPreset(key),
    logger: pino({ level: 'silent' }),
    config: {
      workDir,
      maxRunMs: 60_000,
      maxRunsPerProject: 1,
      commandTimeoutMs: 60_000,
      limits: { memoryMb: 512, cpus: 1, pids: 128 },
      busyRetrySeconds: 15,
      cancelPollMs: 20,
      gitHostUrl: 'https://github.com',
      webUrl: 'http://127.0.0.1:5173',
      gitAuthorEmail: 'agent@aievo.local',
      ...options.config,
    },
  };

  return {
    db,
    workspaceId,
    project,
    task,
    run,
    token,
    secretBox,
    git,
    sandboxes,
    github,
    agent,
    workDir,
    deps,
  };
}

/** USD per million tokens of the fake model: 100 in + 20 out tokens cost 0.0006 USD. */
export const TEST_PRICING = { inputUsdPerMTok: 3, outputUsdPerMTok: 15 };

/** The scripted model of the next run, and the clients runs created from it. */
export interface FakeAgent {
  script: FakeResponse[];
  clients: FakeLlmClient[];
}

export const CODER_RESULT: CoderResult = {
  summary: 'Added sum(a, b) to src/math.ts with tests.',
  changedFiles: ['src/math.ts', 'src/sum.test.ts'],
  tests: { commands: ['npm test'], passed: true, summary: '2 tests passed' },
  openIssues: [],
};

/** A model response that ends the step with `result`. */
export function finishCall(result: Partial<CoderResult> = {}): FakeResponse {
  return { toolCalls: [{ name: 'finish', input: { ...CODER_RESULT, ...result } }] };
}
