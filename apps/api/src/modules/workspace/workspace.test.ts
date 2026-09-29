import { closeTestDb } from '@aievo/db/testing';
import { workspaceSettingsResponseSchema } from '@aievo/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { MISSING_ID, insertModel, setupTestApp } from '../../test/app.js';
import type { TestContext } from '../../test/app.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await setupTestApp();
});

afterAll(closeTestDb);

const getSettings = () => request(ctx.app).get('/api/workspace/settings');
const patchSettings = (body: unknown) =>
  request(ctx.app)
    .patch('/api/workspace/settings')
    .send(body as object);

describe('GET /api/workspace/settings', () => {
  it('returns the settings with defaults', async () => {
    const response = await getSettings();

    expect(response.status).toBe(200);
    expect(workspaceSettingsResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({ agentModels: { coder: null } });
  });
});

describe('PATCH /api/workspace/settings', () => {
  it('sets and clears the model of the Programista', async () => {
    const model = await insertModel(ctx, ctx.workspaceId);

    const set = await patchSettings({ agentModels: { coder: model.id } });
    expect(set.status).toBe(200);
    expect(set.body).toEqual({ agentModels: { coder: model.id } });
    expect((await getSettings()).body).toEqual({ agentModels: { coder: model.id } });

    const cleared = await patchSettings({ agentModels: { coder: null } });
    expect(cleared.body).toEqual({ agentModels: { coder: null } });
  });

  it.each([
    ['disabled', { enabled: false }, /disabled/],
    ['without tool calling', { tools: false }, /capabilities: tools/],
    ['without prices', { priceOut: null }, /pricing/],
  ] as const)('refuses a model %s', async (_name, overrides, message) => {
    const model = await insertModel(ctx, ctx.workspaceId, overrides);

    const response = await patchSettings({ agentModels: { coder: model.id } });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('model_not_usable');
    expect(response.body.error.message).toMatch(message);
    expect((await getSettings()).body).toEqual({ agentModels: { coder: null } });
  });

  it('refuses a missing model and a model of another workspace', async () => {
    const theirs = await insertModel(ctx, ctx.otherWorkspaceId);

    for (const id of [MISSING_ID, theirs.id]) {
      const response = await patchSettings({ agentModels: { coder: id } });
      expect(response.status).toBe(422);
      expect(response.body.error.message).toMatch(/does not exist/);
    }
  });

  it('validates the body', async () => {
    expect((await patchSettings({ agentModels: { coder: 'nope' } })).status).toBe(400);
    expect((await patchSettings({ theme: 'dark' })).status).toBe(400);
  });
});
