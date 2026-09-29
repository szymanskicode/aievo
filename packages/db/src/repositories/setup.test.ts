import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { seed, DEFAULT_WORKSPACE_ID } from '../seed.js';
import { closeTestDb, getTestDb, resetDb } from '../test/db.js';
import { createWorkspace } from '../test/fixtures.js';
import { createGitCredential } from './git-credentials.js';
import { upsertDiscoveredModels } from './models.js';
import { createProject } from './projects.js';
import { createProvider } from './providers.js';
import { getSetupStatus } from './setup.js';

const db = getTestDb();
let workspaceId: string;
let strangerId: string;

const nothingDone = { modelProvider: false, githubToken: false, project: false };

beforeEach(async () => {
  await resetDb(db);
  workspaceId = await createWorkspace(db, 'Own');
  strangerId = await createWorkspace(db, 'Stranger');
});

afterAll(closeTestDb);

async function addModel(inWorkspace: string, enabled: boolean) {
  const provider = await createProvider(db, inWorkspace, {
    type: 'anthropic',
    label: 'Anthropic',
    encryptedKey: 'v1:iv:tag:data',
    keyHint: 'abcd',
    baseUrl: null,
  });
  await upsertDiscoveredModels(db, inWorkspace, provider.id, [
    {
      modelId: 'model',
      displayName: 'Model',
      capabilities: {
        tools: true,
        vision: false,
        structuredOutput: true,
        promptCaching: false,
        reasoning: false,
        contextWindow: null,
        maxOutput: null,
      },
      enabled,
    },
  ]);
}

async function addCredential(inWorkspace: string) {
  return createGitCredential(db, inWorkspace, {
    label: 'GitHub',
    encryptedToken: 'v1:iv:tag:data',
    tokenHint: 'abcd',
    githubLogin: 'octocat',
    expiresAt: null,
  });
}

describe('getSetupStatus', () => {
  it('reports nothing done for an empty workspace', async () => {
    expect(await getSetupStatus(db, workspaceId)).toEqual(nothingDone);
  });

  it('counts a provider only once it has an enabled model', async () => {
    await addModel(workspaceId, false);
    expect((await getSetupStatus(db, workspaceId)).modelProvider).toBe(false);

    await addModel(workspaceId, true);
    expect(await getSetupStatus(db, workspaceId)).toEqual({
      ...nothingDone,
      modelProvider: true,
    });
  });

  it('counts a stored GitHub token', async () => {
    await addCredential(workspaceId);

    expect(await getSetupStatus(db, workspaceId)).toEqual({ ...nothingDone, githubToken: true });
  });

  it('counts only projects linked to a repository', async () => {
    await createProject(db, workspaceId, { name: 'No repo' });
    expect((await getSetupStatus(db, workspaceId)).project).toBe(false);

    const credential = await addCredential(workspaceId);
    await createProject(db, workspaceId, {
      name: 'Hello',
      repo: { owner: 'octocat', name: 'hello', gitCredentialId: credential.id },
    });
    expect((await getSetupStatus(db, workspaceId)).project).toBe(true);
  });

  it('ignores other workspaces', async () => {
    await addModel(strangerId, true);
    const credential = await addCredential(strangerId);
    await createProject(db, strangerId, {
      name: 'Hello',
      repo: { owner: 'octocat', name: 'hello', gitCredentialId: credential.id },
    });

    expect(await getSetupStatus(db, workspaceId)).toEqual(nothingDone);
  });

  it('does not treat a freshly seeded instance as configured', async () => {
    await seed(db);

    expect(await getSetupStatus(db, DEFAULT_WORKSPACE_ID)).toEqual(nothingDone);
  });
});
