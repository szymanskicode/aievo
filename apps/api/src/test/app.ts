import { randomBytes } from 'node:crypto';

import { createGitCredential, createProject, createProvider, createTask } from '@aievo/db';
import type {
  Db,
  GitCredential,
  NewProviderInput,
  Project,
  ProviderCredential,
  Task,
} from '@aievo/db';
import { createWorkspace, getTestDb, resetDb } from '@aievo/db/testing';
import { createSecretBox, keyHint } from '@aievo/shared/crypto';
import type { SecretBox } from '@aievo/shared/crypto';
import type { Express } from 'express';

import { createApp } from '../app.js';

export const MISSING_ID = '00000000-0000-4000-8000-00000000dead';

export interface TestContext {
  db: Db;
  /** App bound to the caller's own workspace. */
  app: Express;
  workspaceId: string;
  /** A second workspace whose data must stay invisible to `app`. */
  otherWorkspaceId: string;
  /** Uses a master key generated for this test run only. */
  secretBox: SecretBox;
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
  const app = createApp({ db, secretBox, resolveWorkspace: () => workspaceId });
  return { db, app, workspaceId, otherWorkspaceId, secretBox };
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
