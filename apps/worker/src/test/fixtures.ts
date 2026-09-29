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
import type { ProjectCommands } from '@aievo/shared';
import { createSecretBox, keyHint } from '@aievo/shared/crypto';
import type { SecretBox } from '@aievo/shared/crypto';
import { pino } from 'pino';

import type { RunnerConfig, RunnerDeps } from '../run/execute-run.js';
import { createGitTokenOpener } from '../run/git-token.js';
import { FakeLocalGit, FakeSandboxFactory } from './fakes.js';

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
  options: { commands?: ProjectCommands; config?: Partial<RunnerConfig> } = {},
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
    settings: { commands: options.commands ?? { install: 'npm ci', test: 'npm test' } },
  });
  if (!project) throw new Error('Project was not updated');
  const task = await newTask(db, workspaceId, project.id, 'Dodaj logowanie');
  const run = await newRun(db, workspaceId, task.id);

  const git = new FakeLocalGit();
  const sandboxes = new FakeSandboxFactory();
  const workDir = await mkdtemp(path.join(tmpdir(), 'aievo-worker-'));
  const deps: RunnerDeps = {
    db,
    git,
    sandboxes,
    openGitToken: createGitTokenOpener(db, secretBox),
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
      ...options.config,
    },
  };

  return { db, workspaceId, project, task, run, token, secretBox, git, sandboxes, workDir, deps };
}
