import { modelCapabilitiesSchema } from '@aievo/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, resetDb } from '../test/db.js';
import { createWorkspace } from '../test/fixtures.js';
import { getModel, listModels, updateModel, upsertDiscoveredModels } from './models.js';
import type { DiscoveredModelInput } from './models.js';
import { createProvider } from './providers.js';

const db = getTestDb();
let workspaceId: string;
let strangerId: string;
let providerId: string;

function discovered(modelId: string, overrides: Partial<DiscoveredModelInput> = {}) {
  return {
    modelId,
    displayName: modelId.toUpperCase(),
    capabilities: modelCapabilitiesSchema.parse({ tools: true }),
    enabled: true,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDb(db);
  workspaceId = await createWorkspace(db, 'Own');
  strangerId = await createWorkspace(db, 'Stranger');
  const provider = await createProvider(db, workspaceId, {
    type: 'openai-compatible',
    label: 'Local',
    encryptedKey: null,
    keyHint: null,
    baseUrl: 'http://127.0.0.1:11434/v1',
  });
  providerId = provider.id;
});

afterAll(closeTestDb);

describe('upsertDiscoveredModels', () => {
  it('inserts new models and returns all models of the provider', async () => {
    const models = await upsertDiscoveredModels(db, workspaceId, providerId, [
      discovered('b'),
      discovered('a', { enabled: false }),
    ]);

    expect(models.map((m) => [m.modelId, m.enabled])).toEqual([
      ['a', false],
      ['b', true],
    ]);
    expect(models[0]).toMatchObject({ workspaceId, providerId, priceIn: null, priceOut: null });
  });

  it('keeps user edits and missing models on the next discovery', async () => {
    const [first] = await upsertDiscoveredModels(db, workspaceId, providerId, [
      discovered('a'),
      discovered('gone'),
    ]);
    await updateModel(db, workspaceId, first!.id, {
      capabilities: { vision: true, contextWindow: 8192 },
      priceIn: 1.5,
      enabled: false,
    });

    const models = await upsertDiscoveredModels(db, workspaceId, providerId, [
      discovered('a', {
        displayName: 'Renamed',
        capabilities: modelCapabilitiesSchema.parse({}),
        enabled: true,
      }),
    ]);

    expect(models.map((m) => m.modelId)).toEqual(['a', 'gone']);
    expect(models[0]).toMatchObject({
      displayName: 'Renamed',
      capabilities: { tools: true, vision: true, contextWindow: 8192 },
      priceIn: 1.5,
      enabled: false,
    });
  });

  it('saves a model reported twice once, as first reported', async () => {
    const models = await upsertDiscoveredModels(db, workspaceId, providerId, [
      discovered('a', { displayName: 'First' }),
      discovered('b'),
      discovered('a', { displayName: 'Second' }),
    ]);

    expect(models.map((m) => [m.modelId, m.displayName])).toEqual([
      ['a', 'First'],
      ['b', 'B'],
    ]);
  });

  it('accepts an empty list', async () => {
    expect(await upsertDiscoveredModels(db, workspaceId, providerId, [])).toEqual([]);
  });

  it('refuses a provider of another workspace', async () => {
    await expect(
      upsertDiscoveredModels(db, strangerId, providerId, [discovered('a')]),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });
});

describe('model repository', () => {
  it('merges a capabilities patch with the stored ones', async () => {
    const [created] = await upsertDiscoveredModels(db, workspaceId, providerId, [discovered('a')]);

    const updated = await updateModel(db, workspaceId, created!.id, {
      capabilities: { reasoning: true, maxOutput: 4096 },
      priceOut: 10,
    });

    expect(updated?.capabilities).toEqual({
      ...modelCapabilitiesSchema.parse({ tools: true }),
      reasoning: true,
      maxOutput: 4096,
    });
    expect(updated?.priceOut).toBe(10);
    expect(await updateModel(db, workspaceId, created!.id, { capabilities: {} })).toEqual(updated);
  });

  it('filters by provider', async () => {
    await upsertDiscoveredModels(db, workspaceId, providerId, [discovered('a')]);
    const other = await createProvider(db, workspaceId, {
      type: 'openai',
      label: 'GPT',
      encryptedKey: 'v1:x:y:z',
      keyHint: null,
      baseUrl: null,
    });
    await upsertDiscoveredModels(db, workspaceId, other.id, [discovered('b')]);

    expect(await listModels(db, workspaceId)).toHaveLength(2);
    expect(
      (await listModels(db, workspaceId, { providerId: other.id })).map((m) => m.modelId),
    ).toEqual(['b']);
  });

  it('lists models by provider, oldest provider first, then by model id', async () => {
    // Created after the provider from `beforeEach`, with a label that sorts first.
    const newer = await createProvider(db, workspaceId, {
      type: 'openai',
      label: 'Aaa newest',
      encryptedKey: 'v1:x:y:z',
      keyHint: null,
      baseUrl: null,
    });
    await upsertDiscoveredModels(db, workspaceId, newer.id, [discovered('m1'), discovered('a0')]);
    await upsertDiscoveredModels(db, workspaceId, providerId, [discovered('z9'), discovered('b2')]);

    expect((await listModels(db, workspaceId)).map((m) => m.modelId)).toEqual([
      'b2',
      'z9',
      'a0',
      'm1',
    ]);
  });

  it('hides models from another workspace', async () => {
    const [created] = await upsertDiscoveredModels(db, workspaceId, providerId, [discovered('a')]);

    expect(await listModels(db, strangerId)).toEqual([]);
    expect(await listModels(db, strangerId, { providerId })).toEqual([]);
    expect(await getModel(db, strangerId, created!.id)).toBeNull();
    expect(await updateModel(db, strangerId, created!.id, { enabled: false })).toBeNull();
    expect(await getModel(db, workspaceId, created!.id)).toEqual(created);
  });
});
