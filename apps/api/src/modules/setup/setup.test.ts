import { createProject, upsertDiscoveredModels } from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { setupStatusSchema } from '@aievo/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  fakeApiKey,
  fakeGitHubToken,
  insertGitCredential,
  insertLinkedProject,
  insertProvider,
  setupTestApp,
} from '../../test/app.js';
import type { TestContext } from '../../test/app.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await setupTestApp();
});

afterAll(closeTestDb);

const nothingDone = { modelProvider: false, githubToken: false, project: false };

async function status() {
  const response = await request(ctx.app).get('/api/setup-status');
  expect(response.status).toBe(200);
  return setupStatusSchema.parse(response.body);
}

async function addModel(workspaceId: string, enabled: boolean) {
  const provider = await insertProvider(ctx, workspaceId, {
    type: 'anthropic',
    label: 'Anthropic',
    apiKey: fakeApiKey(),
    baseUrl: null,
  });
  await upsertDiscoveredModels(ctx.db, workspaceId, provider.id, [
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

describe('GET /api/setup-status', () => {
  it('reports every step as open for an empty workspace', async () => {
    expect(await status()).toEqual(nothingDone);
  });

  it('completes the model step with a provider that has an enabled model', async () => {
    await addModel(ctx.workspaceId, false);
    expect(await status()).toEqual(nothingDone);

    await addModel(ctx.workspaceId, true);
    expect(await status()).toEqual({ ...nothingDone, modelProvider: true });
  });

  it('completes the GitHub step with a stored token', async () => {
    await insertGitCredential(ctx, ctx.workspaceId, fakeGitHubToken());

    expect(await status()).toEqual({ ...nothingDone, githubToken: true });
  });

  it('completes the project step only with a project linked to a repository', async () => {
    await createProject(ctx.db, ctx.workspaceId, { name: 'Seeded example' });
    expect((await status()).project).toBe(false);

    const credential = await insertGitCredential(ctx, ctx.workspaceId, fakeGitHubToken());
    await insertLinkedProject(ctx.db, ctx.workspaceId, credential.id);
    expect(await status()).toEqual({ modelProvider: false, githubToken: true, project: true });
  });

  it('ignores the data of other workspaces', async () => {
    await addModel(ctx.otherWorkspaceId, true);
    const credential = await insertGitCredential(ctx, ctx.otherWorkspaceId, fakeGitHubToken());
    await insertLinkedProject(ctx.db, ctx.otherWorkspaceId, credential.id);

    expect(await status()).toEqual(nothingDone);
  });
});
