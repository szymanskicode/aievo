import { ZodError } from 'zod';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DuplicateRowError, InvalidReferenceError } from '../errors.js';
import { closeTestDb, getTestDb, resetDb } from '../test/db.js';
import { createWorkspace } from '../test/fixtures.js';
import { createGitCredential } from './git-credentials.js';
import type { NewGitCredentialInput } from './git-credentials.js';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from './projects.js';

const db = getTestDb();
let workspaceId: string;

const credentialInput: NewGitCredentialInput = {
  label: 'GitHub',
  encryptedToken: 'v1:iv:tag:data',
  tokenHint: 'abcd',
  githubLogin: 'octocat',
  expiresAt: null,
};

beforeEach(async () => {
  await resetDb(db);
  workspaceId = await createWorkspace(db);
});

afterAll(closeTestDb);

describe('project repository', () => {
  it('creates a project with defaults', async () => {
    const created = await createProject(db, workspaceId, { name: 'Demo' });

    expect(created).toMatchObject({
      workspaceId,
      name: 'Demo',
      description: '',
      repoUrl: null,
      defaultBranch: 'main',
      settings: { commands: {} },
    });
    expect(created.testPolicy.changedLines.minLineCoverage).toBe(80);
    expect(await getProject(db, workspaceId, created.id)).toEqual(created);
  });

  it('links a project to a repository and a credential of the workspace', async () => {
    const credential = await createGitCredential(db, workspaceId, credentialInput);

    const created = await createProject(db, workspaceId, {
      name: 'Hello',
      repoUrl: 'https://github.com/octocat/hello',
      repo: { owner: 'octocat', name: 'hello', gitCredentialId: credential.id },
    });

    expect(created).toMatchObject({
      repoOwner: 'octocat',
      repoName: 'hello',
      gitCredentialId: credential.id,
    });
  });

  it('refuses a credential of another workspace', async () => {
    const strangerId = await createWorkspace(db, 'Stranger');
    const credential = await createGitCredential(db, strangerId, credentialInput);

    await expect(
      createProject(db, workspaceId, {
        name: 'Hello',
        repo: { owner: 'octocat', name: 'hello', gitCredentialId: credential.id },
      }),
    ).rejects.toBeInstanceOf(InvalidReferenceError);
    expect(await listProjects(db, workspaceId)).toEqual([]);
  });

  it('allows one project per repository in a workspace, ignoring letter case', async () => {
    const credential = await createGitCredential(db, workspaceId, credentialInput);
    const repo = { owner: 'octocat', name: 'hello', gitCredentialId: credential.id };
    await createProject(db, workspaceId, { name: 'First', repo });

    await expect(
      createProject(db, workspaceId, {
        name: 'Second',
        repo: { ...repo, owner: 'OctoCat', name: 'Hello' },
      }),
    ).rejects.toBeInstanceOf(DuplicateRowError);
    expect((await listProjects(db, workspaceId)).map((p) => p.name)).toEqual(['First']);
  });

  it('lets other workspaces and projects without a repository coexist', async () => {
    const strangerId = await createWorkspace(db, 'Stranger');
    const own = await createGitCredential(db, workspaceId, credentialInput);
    const foreign = await createGitCredential(db, strangerId, credentialInput);
    const repo = { owner: 'octocat', name: 'hello' };

    await createProject(db, workspaceId, { name: 'A', repo: { ...repo, gitCredentialId: own.id } });
    await createProject(db, strangerId, {
      name: 'B',
      repo: { ...repo, gitCredentialId: foreign.id },
    });
    await createProject(db, workspaceId, { name: 'No repo 1' });
    await createProject(db, workspaceId, { name: 'No repo 2' });

    expect(await listProjects(db, workspaceId)).toHaveLength(3);
  });

  it('lists projects of the workspace', async () => {
    await createProject(db, workspaceId, { name: 'A' });
    await createProject(db, workspaceId, { name: 'B' });

    const names = (await listProjects(db, workspaceId)).map((p) => p.name);
    expect(names).toEqual(['A', 'B']);
  });

  it('updates fields and bumps updatedAt', async () => {
    const created = await createProject(db, workspaceId, { name: 'Demo' });

    const updated = await updateProject(db, workspaceId, created.id, {
      name: 'Renamed',
      testPolicy: { changedLines: { minLineCoverage: 95 } },
    });

    expect(updated?.name).toBe('Renamed');
    expect(updated?.testPolicy.changedLines.minLineCoverage).toBe(95);
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
  });

  it('returns the project unchanged for an empty patch', async () => {
    const created = await createProject(db, workspaceId, { name: 'Demo' });
    expect(await updateProject(db, workspaceId, created.id, {})).toEqual(created);
  });

  it('rejects invalid JSONB on create and update', async () => {
    await expect(
      createProject(db, workspaceId, {
        name: 'Bad',
        testPolicy: { changedLines: { minLineCoverage: 150 } },
      }),
    ).rejects.toBeInstanceOf(ZodError);

    const created = await createProject(db, workspaceId, { name: 'Demo' });
    await expect(
      updateProject(db, workspaceId, created.id, { settings: { commands: { test: '' } } }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it('deletes a project', async () => {
    const created = await createProject(db, workspaceId, { name: 'Demo' });

    expect(await deleteProject(db, workspaceId, created.id)).toBe(true);
    expect(await getProject(db, workspaceId, created.id)).toBeNull();
    expect(await deleteProject(db, workspaceId, created.id)).toBe(false);
  });
});
