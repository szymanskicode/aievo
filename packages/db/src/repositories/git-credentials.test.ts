import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { RowInUseError } from '../errors.js';
import { project } from '../schema/index.js';
import { closeTestDb, getTestDb, resetDb } from '../test/db.js';
import { createWorkspace } from '../test/fixtures.js';
import {
  createGitCredential,
  deleteGitCredential,
  getGitCredential,
  listGitCredentials,
} from './git-credentials.js';
import type { NewGitCredentialInput } from './git-credentials.js';
import { createProject } from './projects.js';

const db = getTestDb();
let workspaceId: string;
let strangerId: string;

const input: NewGitCredentialInput = {
  label: 'GitHub',
  encryptedToken: 'v1:iv:tag:data',
  tokenHint: 'abcd',
  githubLogin: 'octocat',
  expiresAt: new Date('2026-12-31T00:00:00Z'),
};

beforeEach(async () => {
  await resetDb(db);
  workspaceId = await createWorkspace(db, 'Own');
  strangerId = await createWorkspace(db, 'Stranger');
});

afterAll(closeTestDb);

describe('git credential repository', () => {
  it('creates and reads a credential with GitHub as the default provider', async () => {
    const created = await createGitCredential(db, workspaceId, input);

    expect(created).toMatchObject({ workspaceId, provider: 'github', ...input });
    expect(await getGitCredential(db, workspaceId, created.id)).toEqual(created);
    expect(await listGitCredentials(db, workspaceId)).toEqual([created]);
  });

  it('keeps credentials inside their workspace', async () => {
    const created = await createGitCredential(db, workspaceId, input);

    expect(await listGitCredentials(db, strangerId)).toEqual([]);
    expect(await getGitCredential(db, strangerId, created.id)).toBeNull();
    expect(await deleteGitCredential(db, strangerId, created.id)).toBe(false);
    expect(await getGitCredential(db, workspaceId, created.id)).not.toBeNull();
  });

  it('deletes an unused credential', async () => {
    const created = await createGitCredential(db, workspaceId, input);

    expect(await deleteGitCredential(db, workspaceId, created.id)).toBe(true);
    expect(await listGitCredentials(db, workspaceId)).toEqual([]);
    expect(await deleteGitCredential(db, workspaceId, created.id)).toBe(false);
  });

  it('refuses to delete a credential that a project uses', async () => {
    const created = await createGitCredential(db, workspaceId, input);
    await db.insert(project).values({
      workspaceId,
      name: 'Repo project',
      repoOwner: 'octocat',
      repoName: 'demo',
      gitCredentialId: created.id,
      settings: { commands: {} },
      testPolicy: (await createProject(db, workspaceId, { name: 'Defaults' })).testPolicy,
    });

    await expect(deleteGitCredential(db, workspaceId, created.id)).rejects.toBeInstanceOf(
      RowInUseError,
    );
    expect(await getGitCredential(db, workspaceId, created.id)).not.toBeNull();
  });
});
