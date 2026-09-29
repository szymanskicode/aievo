import { randomBytes } from 'node:crypto';

import { listModels, updateModel } from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { providerTestResultSchema } from '@aievo/shared';
import { createSecretBox } from '@aievo/shared/crypto';
import { HttpResponse, http } from 'msw';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { MISSING_ID, fakeApiKey, insertProvider, setupTestApp } from '../../test/app.js';
import type { TestContext } from '../../test/app.js';
import { useMockProviders } from '../../test/msw.js';

const server = useMockProviders();

let ctx: TestContext;

beforeEach(async () => {
  ctx = await setupTestApp();
});

afterAll(closeTestDb);

// Loopback is reserved for supertest, so the mocked Ollama lives on a test host.
const OLLAMA_URL = 'http://ollama.test:11434/v1';

function anthropicModels(ids: string[]) {
  return HttpResponse.json({
    data: ids.map((id) => ({ id, display_name: id.toUpperCase(), type: 'model' })),
    has_more: false,
    last_id: ids.at(-1) ?? null,
  });
}

describe('POST /api/providers/:id/test', () => {
  it('checks an Anthropic key and saves the models it reports', async () => {
    const apiKey = fakeApiKey();
    const provider = await insertProvider(ctx, ctx.workspaceId, {
      type: 'anthropic',
      label: 'Claude',
      apiKey,
      baseUrl: null,
    });
    let sentKey: string | null = null;
    server.use(
      http.get('https://api.anthropic.com/v1/models', ({ request: req }) => {
        sentKey = req.headers.get('x-api-key');
        return anthropicModels(['claude-b', 'claude-a']);
      }),
    );

    const response = await request(ctx.app).post(`/api/providers/${provider.id}/test`);

    expect(response.status).toBe(200);
    expect(sentKey).toBe(apiKey);
    expect(providerTestResultSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.discovered).toBe(2);
    expect(response.body.models.map((m: { modelId: string }) => m.modelId)).toEqual([
      'claude-a',
      'claude-b',
    ]);
    expect(response.body.models[0]).toMatchObject({
      providerId: provider.id,
      displayName: 'CLAUDE-A',
      capabilities: { tools: true, vision: true },
      enabled: true,
    });
    expect(response.text).not.toContain(apiKey);
    expect(await listModels(ctx.db, ctx.workspaceId, { providerId: provider.id })).toHaveLength(2);
  });

  it('lists Ollama models without a key', async () => {
    const provider = await insertProvider(ctx, ctx.workspaceId, {
      type: 'openai-compatible',
      label: 'Ollama',
      apiKey: null,
      baseUrl: OLLAMA_URL,
    });
    let authorization: string | null = 'not checked';
    server.use(
      http.get(`${OLLAMA_URL}/models`, ({ request: req }) => {
        authorization = req.headers.get('authorization');
        return HttpResponse.json({ object: 'list', data: [{ id: 'llama3.2:latest' }] });
      }),
    );

    const response = await request(ctx.app).post(`/api/providers/${provider.id}/test`);

    expect(response.status).toBe(200);
    expect(authorization).toBeNull();
    expect(response.body.models).toEqual([
      expect.objectContaining({ modelId: 'llama3.2:latest', displayName: 'llama3.2:latest' }),
    ]);
  });

  it('keeps manual edits when the test runs again', async () => {
    const provider = await insertProvider(ctx, ctx.workspaceId, {
      type: 'anthropic',
      label: 'Claude',
      apiKey: fakeApiKey(),
      baseUrl: null,
    });
    server.use(
      http.get('https://api.anthropic.com/v1/models', () => anthropicModels(['claude-a'])),
    );
    const first = await request(ctx.app).post(`/api/providers/${provider.id}/test`);
    await updateModel(ctx.db, ctx.workspaceId, first.body.models[0].id, {
      capabilities: { reasoning: true },
      priceIn: 3,
      enabled: false,
    });

    const second = await request(ctx.app).post(`/api/providers/${provider.id}/test`);

    expect(second.body.models).toEqual([
      expect.objectContaining({
        id: first.body.models[0].id,
        capabilities: expect.objectContaining({ reasoning: true }),
        priceIn: 3,
        enabled: false,
      }),
    ]);
  });

  it.each([
    [401, 400, 'provider_auth_failed'],
    [429, 429, 'provider_rate_limited'],
    [500, 502, 'provider_unavailable'],
    [404, 502, 'provider_bad_response'],
  ])('maps provider HTTP %i to %i %s', async (providerStatus, status, code) => {
    const apiKey = fakeApiKey();
    const provider = await insertProvider(ctx, ctx.workspaceId, {
      type: 'openai',
      label: 'GPT',
      apiKey,
      baseUrl: null,
    });
    server.use(
      http.get('https://api.openai.com/v1/models', () =>
        HttpResponse.json(
          { error: { message: `Incorrect API key provided: ${apiKey}` } },
          { status: providerStatus },
        ),
      ),
    );

    const response = await request(ctx.app).post(`/api/providers/${provider.id}/test`);

    expect(response.status).toBe(status);
    expect(response.body.error).toEqual({
      code,
      message: expect.any(String),
      details: { providerStatus },
    });
    expect(response.text).not.toContain(apiKey);
    expect(response.text).not.toContain('api.openai.com');
    expect(response.text).not.toContain('Incorrect API key');
    expect(await listModels(ctx.db, ctx.workspaceId)).toEqual([]);
  });

  it('reports an unreachable provider', async () => {
    const provider = await insertProvider(ctx, ctx.workspaceId, {
      type: 'openai-compatible',
      label: 'Down',
      apiKey: null,
      baseUrl: OLLAMA_URL,
    });
    server.use(http.get(`${OLLAMA_URL}/models`, () => HttpResponse.error()));

    const response = await request(ctx.app).post(`/api/providers/${provider.id}/test`);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('provider_unavailable');
    expect(response.text).not.toContain('ollama.test');
  });

  it('blocks requests to providers that have no mock', async () => {
    // A real api.openai.com would answer 401 (400 here); the mock layer must stop it first.
    const provider = await insertProvider(ctx, ctx.workspaceId, {
      type: 'openai',
      label: 'Unmocked',
      apiKey: fakeApiKey(),
      baseUrl: null,
    });

    const response = await request(ctx.app).post(`/api/providers/${provider.id}/test`);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('provider_unavailable');
  });

  it('answers 404 for a missing or foreign provider', async () => {
    const foreign = await insertProvider(ctx, ctx.otherWorkspaceId, {
      type: 'openai-compatible',
      label: 'Foreign',
      apiKey: null,
      baseUrl: OLLAMA_URL,
    });

    expect((await request(ctx.app).post(`/api/providers/${MISSING_ID}/test`)).status).toBe(404);
    expect((await request(ctx.app).post(`/api/providers/${foreign.id}/test`)).status).toBe(404);
  });

  it('asks for the key again when the stored one cannot be decrypted', async () => {
    const apiKey = fakeApiKey();
    // Encrypted with another master key, as after AIEVO_MASTER_KEY was changed.
    const provider = await insertProvider(
      { db: ctx.db, secretBox: createSecretBox(randomBytes(32)) },
      ctx.workspaceId,
      { type: 'anthropic', label: 'Claude', apiKey, baseUrl: null },
    );
    let called = false;
    server.use(
      http.get('https://api.anthropic.com/v1/models', () => {
        called = true;
        return anthropicModels([]);
      }),
    );

    const response = await request(ctx.app).post(`/api/providers/${provider.id}/test`);

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: 'provider_key_unreadable',
      message: expect.stringMatching(/Enter the key again/),
    });
    expect(JSON.stringify(response.body)).not.toContain(apiKey);
    expect(called).toBe(false);
  });
});
