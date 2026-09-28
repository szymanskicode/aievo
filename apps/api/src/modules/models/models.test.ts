import { getModel, upsertDiscoveredModels } from '@aievo/db';
import type { Model } from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { modelCapabilitiesSchema, modelSchema } from '@aievo/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { MISSING_ID, fakeApiKey, insertProvider, setupTestApp } from '../../test/app.js';
import type { TestContext } from '../../test/app.js';

let ctx: TestContext;

async function insertModels(workspaceId: string, label: string, ids: string[]): Promise<Model[]> {
  const provider = await insertProvider(ctx, workspaceId, {
    type: 'openai',
    label,
    apiKey: fakeApiKey(),
    baseUrl: null,
  });
  return upsertDiscoveredModels(
    ctx.db,
    workspaceId,
    provider.id,
    ids.map((modelId) => ({
      modelId,
      displayName: modelId,
      capabilities: modelCapabilitiesSchema.parse({ tools: true }),
      enabled: true,
    })),
  );
}

beforeEach(async () => {
  ctx = await setupTestApp();
});

afterAll(closeTestDb);

describe('GET /api/models', () => {
  it('lists models of the workspace', async () => {
    const [model] = await insertModels(ctx.workspaceId, 'GPT', ['gpt-a']);
    await insertModels(ctx.otherWorkspaceId, 'Foreign', ['foreign']);

    const response = await request(ctx.app).get('/api/models');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: model!.id,
        providerId: model!.providerId,
        modelId: 'gpt-a',
        displayName: 'gpt-a',
        capabilities: modelCapabilitiesSchema.parse({ tools: true }),
        priceIn: null,
        priceOut: null,
        enabled: true,
      },
    ]);
    expect(modelSchema.safeParse(response.body[0]).success).toBe(true);
  });

  it('filters by provider', async () => {
    await insertModels(ctx.workspaceId, 'A', ['a']);
    const [b] = await insertModels(ctx.workspaceId, 'B', ['b']);

    const response = await request(ctx.app).get(`/api/models?providerId=${b!.providerId}`);

    expect(response.body.map((m: { modelId: string }) => m.modelId)).toEqual(['b']);
  });

  it('rejects an invalid provider id', async () => {
    expect((await request(ctx.app).get('/api/models?providerId=nope')).status).toBe(400);
  });
});

describe('PATCH /api/models/:id', () => {
  it('merges capabilities and sets prices and availability', async () => {
    const [model] = await insertModels(ctx.workspaceId, 'GPT', ['gpt-a']);

    const response = await request(ctx.app)
      .patch(`/api/models/${model!.id}`)
      .send({
        capabilities: { vision: true, contextWindow: 128000 },
        priceIn: 2.5,
        priceOut: 10,
        enabled: false,
        displayName: 'GPT A',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      displayName: 'GPT A',
      capabilities: { tools: true, vision: true, contextWindow: 128000, reasoning: false },
      priceIn: 2.5,
      priceOut: 10,
      enabled: false,
    });
    expect(await getModel(ctx.db, ctx.workspaceId, model!.id)).toMatchObject({ enabled: false });
  });

  it('rejects unknown capabilities', async () => {
    const [model] = await insertModels(ctx.workspaceId, 'GPT', ['gpt-a']);

    const response = await request(ctx.app)
      .patch(`/api/models/${model!.id}`)
      .send({ capabilities: { telepathy: true } });

    expect(response.status).toBe(400);
  });

  it('answers 404 for a missing or foreign model', async () => {
    const [foreign] = await insertModels(ctx.otherWorkspaceId, 'Foreign', ['x']);

    expect((await request(ctx.app).patch(`/api/models/${MISSING_ID}`).send({})).status).toBe(404);
    expect(
      (await request(ctx.app).patch(`/api/models/${foreign!.id}`).send({ enabled: false })).status,
    ).toBe(404);
    expect(await getModel(ctx.db, ctx.otherWorkspaceId, foreign!.id)).toMatchObject({
      enabled: true,
    });
  });
});
