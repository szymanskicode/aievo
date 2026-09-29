import { randomBytes } from 'node:crypto';

import {
  createGitCredential,
  createProject,
  createProvider,
  createTask,
  updateModel,
  upsertDiscoveredModels,
} from '@aievo/db';
import type {
  Db,
  GitCredential,
  Model,
  NewProviderInput,
  Project,
  ProviderCredential,
  Task,
} from '@aievo/db';
import { createWorkspace, getTestDb, resetDb } from '@aievo/db/testing';
import type { RunQueue } from '@aievo/queue';
import { modelCapabilitiesSchema } from '@aievo/shared';
import { createSecretBox, keyHint } from '@aievo/shared/crypto';
import type { SecretBox } from '@aievo/shared/crypto';
import type { Express } from 'express';

import { createApp } from '../app.js';

export const MISSING_ID = '00000000-0000-4000-8000-00000000dead';

/** Records the runs handed to the queue instead of sending them to pg-boss. */
export interface FakeRunQueue extends RunQueue {
  enqueued: string[];
  /** When set, `enqueueRun` rejects with it. */
  failWith?: Error;
}

export function fakeRunQueue(): FakeRunQueue {
  const queue: FakeRunQueue = {
    enqueued: [],
    enqueueRun(runId) {
      if (queue.failWith) return Promise.reject(queue.failWith);
      queue.enqueued.push(runId);
      return Promise.resolve();
    },
  };
  return queue;
}

export interface TestContext {
  db: Db;
  /** App bound to the caller's own workspace. */
  app: Express;
  workspaceId: string;
  /** A second workspace whose data must stay invisible to `app`. */
  otherWorkspaceId: string;
  /** Uses a master key generated for this test run only. */
  secretBox: SecretBox;
  queue: FakeRunQueue;
}

/** A secret box with a master key generated for this test run only. */
export function testSecretBox(): SecretBox {
  return createSecretBox(randomBytes(32));
}

/** Empties the database and returns an app bound to a fresh workspace. */
export async function setupTestApp(): Promise<TestContext> {
  const db = getTestDb();
  await resetDb(db);
  const workspaceId = await createWorkspace(db, 'Own');
  const otherWorkspaceId = await createWorkspace(db, 'Other');
  const secretBox = testSecretBox();
  const queue = fakeRunQueue();
  const app = createApp({ db, secretBox, queue, resolveWorkspace: () => workspaceId });
  return { db, app, workspaceId, otherWorkspaceId, secretBox, queue };
}

export async function insertProject(db: Db, workspaceId: string, name = 'Demo'): Promise<Project> {
  return createProject(db, workspaceId, { name });
}

export async function insertTask(
  db: Db,
  workspaceId: string,
  projectId: string,
  title = 'Task',
): Promise<Task> {
  const task = await createTask(db, workspaceId, projectId, { title });
  if (!task) throw new Error('Task was not created');
  return task;
}

/** A fake key that exists only inside this test process; never a real credential. */
export function fakeApiKey(): string {
  return `sk-test-${randomBytes(16).toString('hex')}`;
}

/** Stores a provider the way the API does, with the key encrypted by `ctx.secretBox`. */
export async function insertProvider(
  ctx: Pick<TestContext, 'db' | 'secretBox'>,
  workspaceId: string,
  input: Omit<NewProviderInput, 'encryptedKey' | 'keyHint'> & { apiKey: string | null },
): Promise<ProviderCredential> {
  const { apiKey, ...rest } = input;
  return createProvider(ctx.db, workspaceId, {
    ...rest,
    encryptedKey: apiKey === null ? null : ctx.secretBox.encrypt(apiKey),
    keyHint: apiKey === null ? null : keyHint(apiKey),
  });
}

/** A fake fine-grained GitHub token that exists only inside this test process. */
export function fakeGitHubToken(): string {
  return `github_pat_${randomBytes(20).toString('hex')}`;
}

/** Stores a Git credential the way the API does, with the token encrypted by `ctx.secretBox`. */
export async function insertGitCredential(
  ctx: Pick<TestContext, 'db' | 'secretBox'>,
  workspaceId: string,
  token: string,
  label = 'GitHub',
): Promise<GitCredential> {
  return createGitCredential(ctx.db, workspaceId, {
    label,
    encryptedToken: ctx.secretBox.encrypt(token),
    tokenHint: keyHint(token),
    githubLogin: 'octocat',
    expiresAt: null,
  });
}

/** A project linked to the GitHub repository `octocat/demo` through a stored credential. */
export async function insertLinkedProject(
  db: Db,
  workspaceId: string,
  credentialId: string,
  name = 'Demo',
): Promise<Project> {
  return createProject(db, workspaceId, {
    name,
    repoUrl: 'https://github.com/octocat/demo',
    repo: { owner: 'octocat', name: 'demo', gitCredentialId: credentialId },
  });
}

/**
 * A model of a new provider, by default one the Programista can run on (enabled, with tool
 * calling and prices).
 */
export async function insertModel(
  ctx: Pick<TestContext, 'db' | 'secretBox'>,
  workspaceId: string,
  overrides: Partial<Pick<Model, 'enabled' | 'priceIn' | 'priceOut'>> & {
    tools?: boolean;
  } = {},
): Promise<Model> {
  const provider = await insertProvider(ctx, workspaceId, {
    type: 'anthropic',
    label: 'Anthropic',
    apiKey: fakeApiKey(),
    baseUrl: null,
  });
  const [model] = await upsertDiscoveredModels(ctx.db, workspaceId, provider.id, [
    {
      modelId: 'claude-test',
      displayName: 'Claude Test',
      capabilities: modelCapabilitiesSchema.parse({ tools: overrides.tools ?? true }),
      enabled: true,
    },
  ]);
  if (!model) throw new Error('Model was not created');
  const updated = await updateModel(ctx.db, workspaceId, model.id, {
    enabled: overrides.enabled ?? true,
    priceIn: overrides.priceIn === undefined ? 3 : overrides.priceIn,
    priceOut: overrides.priceOut === undefined ? 15 : overrides.priceOut,
  });
  if (!updated) throw new Error('Model was not updated');
  return updated;
}
