import { getProvider } from '@aievo/db';
import { closeTestDb } from '@aievo/db/testing';
import { providerSchema, providerTypeInfoSchema } from '@aievo/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { MISSING_ID, fakeApiKey, insertProvider, setupTestApp } from '../../test/app.js';
import type { TestContext } from '../../test/app.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await setupTestApp();
});

afterAll(closeTestDb);

/**
 * Asserts that nothing from the key or its stored form appears anywhere in a response:
 * not the key, not its prefix (everything but the 4-character hint), not the ciphertext.
 */
async function expectNoSecrets(text: string, apiKey: string, providerId?: string) {
  expect(text).not.toContain(apiKey);
  expect(text).not.toContain(apiKey.slice(0, -4));
  expect(text).not.toMatch(/encryptedKey|encrypted_key|apiKey/);
  expect(text).not.toMatch(/v1:[A-Za-z0-9+/=]+:/);
  if (providerId) {
    const stored = await getProvider(ctx.db, ctx.workspaceId, providerId);
    if (stored?.encryptedKey) {
      for (const part of stored.encryptedKey.split(':').slice(1)) {
        expect(text).not.toContain(part);
      }
    }
  }
}

describe('GET /api/provider-types', () => {
  it('lists the provider types with their required fields', async () => {
    const response = await request(ctx.app).get('/api/provider-types');

    expect(response.status).toBe(200);
    expect(response.body.map((t: { type: string }) => t.type)).toEqual([
      'anthropic',
      'openai',
      'openai-compatible',
    ]);
    expect(response.body[2]).toMatchObject({ apiKey: 'optional', baseUrl: 'required' });
    expect(providerTypeInfoSchema.safeParse(response.body[0]).success).toBe(true);
  });
});

describe('POST /api/providers', () => {
  it('stores the key encrypted and returns only a hint', async () => {
    const apiKey = fakeApiKey();

    const response = await request(ctx.app)
      .post('/api/providers')
      .send({ type: 'anthropic', label: 'Claude', apiKey });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      type: 'anthropic',
      label: 'Claude',
      hasKey: true,
      keyHint: apiKey.slice(-4),
      baseUrl: null,
    });
    expect(Object.keys(response.body).sort()).toEqual(Object.keys(providerSchema.shape).sort());
    await expectNoSecrets(response.text, apiKey, response.body.id);

    const stored = await getProvider(ctx.db, ctx.workspaceId, response.body.id);
    expect(stored?.encryptedKey).toMatch(/^v1:/);
    expect(stored?.encryptedKey).not.toContain(apiKey);
    expect(ctx.secretBox.decrypt(stored!.encryptedKey!)).toBe(apiKey);
  });

  it('accepts an OpenAI-compatible server without a key', async () => {
    const response = await request(ctx.app).post('/api/providers').send({
      type: 'openai-compatible',
      label: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ hasKey: false, keyHint: null });
  });

  it('does not hint at a short key', async () => {
    const response = await request(ctx.app).post('/api/providers').send({
      type: 'openai-compatible',
      label: 'LM',
      apiKey: 'lm-studio',
      baseUrl: 'http://x.test/v1',
    });

    expect(response.body).toMatchObject({ hasKey: true, keyHint: null });
  });

  it('rejects missing required fields without echoing the key', async () => {
    const apiKey = fakeApiKey();

    const noKey = await request(ctx.app)
      .post('/api/providers')
      .send({ type: 'openai', label: 'GPT' });
    const noUrl = await request(ctx.app)
      .post('/api/providers')
      .send({ type: 'openai-compatible', label: 'Local', apiKey });

    expect(noKey.status).toBe(400);
    expect(noKey.body.error.details).toEqual([
      expect.objectContaining({ path: ['body', 'apiKey'] }),
    ]);
    expect(noUrl.status).toBe(400);
    expect(noUrl.body.error.details).toEqual([
      expect.objectContaining({ path: ['body', 'baseUrl'] }),
    ]);
    await expectNoSecrets(noUrl.text, apiKey);
  });
});

describe('GET /api/providers', () => {
  it('lists providers of the workspace without keys', async () => {
    const apiKey = fakeApiKey();
    const own = await insertProvider(ctx, ctx.workspaceId, {
      type: 'openai',
      label: 'GPT',
      apiKey,
      baseUrl: null,
    });
    await insertProvider(ctx, ctx.otherWorkspaceId, {
      type: 'openai',
      label: 'Foreign',
      apiKey: fakeApiKey(),
      baseUrl: null,
    });

    const response = await request(ctx.app).get('/api/providers');

    expect(response.status).toBe(200);
    expect(response.body.map((p: { id: string }) => p.id)).toEqual([own.id]);
    await expectNoSecrets(response.text, apiKey, own.id);
  });
});

describe('PATCH /api/providers/:id', () => {
  it('replaces the key and its hint', async () => {
    const oldKey = fakeApiKey();
    const newKey = fakeApiKey();
    const provider = await insertProvider(ctx, ctx.workspaceId, {
      type: 'anthropic',
      label: 'Claude',
      apiKey: oldKey,
      baseUrl: null,
    });

    const response = await request(ctx.app)
      .patch(`/api/providers/${provider.id}`)
      .send({ apiKey: newKey, label: 'Claude 2' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ label: 'Claude 2', keyHint: newKey.slice(-4) });
    await expectNoSecrets(response.text, newKey, provider.id);
    await expectNoSecrets(response.text, oldKey);

    const stored = await getProvider(ctx.db, ctx.workspaceId, provider.id);
    expect(ctx.secretBox.decrypt(stored!.encryptedKey!)).toBe(newKey);
  });

  it('refuses to move a stored key to a new base URL', async () => {
    const provider = await insertProvider(ctx, ctx.workspaceId, {
      type: 'anthropic',
      label: 'Claude',
      apiKey: fakeApiKey(),
      baseUrl: null,
    });

    const response = await request(ctx.app)
      .patch(`/api/providers/${provider.id}`)
      .send({ baseUrl: 'https://attacker.example.test/v1' });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      expect.objectContaining({ path: ['body', 'apiKey'] }),
    ]);
    expect(await getProvider(ctx.db, ctx.workspaceId, provider.id)).toEqual(provider);
  });

  it('changes the base URL together with a new key, or without a stored key', async () => {
    const newKey = fakeApiKey();
    const hosted = await insertProvider(ctx, ctx.workspaceId, {
      type: 'openai',
      label: 'GPT',
      apiKey: fakeApiKey(),
      baseUrl: null,
    });
    const local = await insertProvider(ctx, ctx.workspaceId, {
      type: 'openai-compatible',
      label: 'Ollama',
      apiKey: null,
      baseUrl: 'http://ollama.test/v1',
    });

    const withKey = await request(ctx.app)
      .patch(`/api/providers/${hosted.id}`)
      .send({ baseUrl: 'https://proxy.example.test/v1', apiKey: newKey });
    const withoutKey = await request(ctx.app)
      .patch(`/api/providers/${local.id}`)
      .send({ baseUrl: 'http://other.test/v1' });
    const sameUrl = await request(ctx.app)
      .patch(`/api/providers/${hosted.id}`)
      .send({ baseUrl: 'https://proxy.example.test/v1', label: 'Renamed' });

    expect(withKey.status).toBe(200);
    expect(withKey.body).toMatchObject({
      baseUrl: 'https://proxy.example.test/v1',
      keyHint: newKey.slice(-4),
    });
    expect(withoutKey.status).toBe(200);
    expect(sameUrl.status).toBe(200);
  });

  it('keeps the key when it is not in the patch', async () => {
    const apiKey = fakeApiKey();
    const provider = await insertProvider(ctx, ctx.workspaceId, {
      type: 'anthropic',
      label: 'Claude',
      apiKey,
      baseUrl: null,
    });

    await request(ctx.app).patch(`/api/providers/${provider.id}`).send({ label: 'Renamed' });

    const stored = await getProvider(ctx.db, ctx.workspaceId, provider.id);
    expect(stored?.encryptedKey).toBe(provider.encryptedKey);
  });

  it('removes an optional key but refuses to remove a required one', async () => {
    const local = await insertProvider(ctx, ctx.workspaceId, {
      type: 'openai-compatible',
      label: 'Local',
      apiKey: fakeApiKey(),
      baseUrl: 'http://ollama.test/v1',
    });
    const hosted = await insertProvider(ctx, ctx.workspaceId, {
      type: 'openai',
      label: 'GPT',
      apiKey: fakeApiKey(),
      baseUrl: null,
    });

    const removed = await request(ctx.app)
      .patch(`/api/providers/${local.id}`)
      .send({ apiKey: null });
    const refused = await request(ctx.app)
      .patch(`/api/providers/${hosted.id}`)
      .send({ apiKey: null });
    const noUrl = await request(ctx.app)
      .patch(`/api/providers/${local.id}`)
      .send({ baseUrl: null });

    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ hasKey: false, keyHint: null });
    expect(refused.status).toBe(400);
    expect(refused.body.error.details).toEqual([
      expect.objectContaining({ path: ['body', 'apiKey'] }),
    ]);
    expect(noUrl.status).toBe(400);
  });

  it('does not change the type', async () => {
    const provider = await insertProvider(ctx, ctx.workspaceId, {
      type: 'openai',
      label: 'GPT',
      apiKey: fakeApiKey(),
      baseUrl: null,
    });

    const response = await request(ctx.app)
      .patch(`/api/providers/${provider.id}`)
      .send({ type: 'anthropic' });

    expect(response.status).toBe(400);
  });

  it('answers 404 for a provider of another workspace', async () => {
    const foreign = await insertProvider(ctx, ctx.otherWorkspaceId, {
      type: 'openai',
      label: 'Foreign',
      apiKey: fakeApiKey(),
      baseUrl: null,
    });

    const response = await request(ctx.app)
      .patch(`/api/providers/${foreign.id}`)
      .send({ label: 'Hacked' });

    expect(response.status).toBe(404);
    expect((await getProvider(ctx.db, ctx.otherWorkspaceId, foreign.id))?.label).toBe('Foreign');
  });
});

describe('DELETE /api/providers/:id', () => {
  it('deletes the provider', async () => {
    const provider = await insertProvider(ctx, ctx.workspaceId, {
      type: 'openai',
      label: 'GPT',
      apiKey: fakeApiKey(),
      baseUrl: null,
    });

    const response = await request(ctx.app).delete(`/api/providers/${provider.id}`);

    expect(response.status).toBe(204);
    expect(await getProvider(ctx.db, ctx.workspaceId, provider.id)).toBeNull();
  });

  it('answers 404 for a missing or foreign provider', async () => {
    const foreign = await insertProvider(ctx, ctx.otherWorkspaceId, {
      type: 'openai',
      label: 'Foreign',
      apiKey: fakeApiKey(),
      baseUrl: null,
    });

    expect((await request(ctx.app).delete(`/api/providers/${MISSING_ID}`)).status).toBe(404);
    expect((await request(ctx.app).delete(`/api/providers/${foreign.id}`)).status).toBe(404);
    expect(await getProvider(ctx.db, ctx.otherWorkspaceId, foreign.id)).not.toBeNull();
  });
});
