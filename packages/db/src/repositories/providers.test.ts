import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, resetDb } from '../test/db.js';
import { createWorkspace } from '../test/fixtures.js';
import { listModels, upsertDiscoveredModels } from './models.js';
import {
  createProvider,
  deleteProvider,
  getProvider,
  listProviders,
  updateProvider,
} from './providers.js';
import type { NewProviderInput } from './providers.js';

const db = getTestDb();
let workspaceId: string;
let strangerId: string;

const anthropic: NewProviderInput = {
  type: 'anthropic',
  label: 'Claude',
  encryptedKey: 'v1:iv:tag:data',
  keyHint: 'abcd',
  baseUrl: null,
};

beforeEach(async () => {
  await resetDb(db);
  workspaceId = await createWorkspace(db, 'Own');
  strangerId = await createWorkspace(db, 'Stranger');
});

afterAll(closeTestDb);

describe('provider repository', () => {
  it('creates and reads a provider', async () => {
    const created = await createProvider(db, workspaceId, anthropic);

    expect(created).toMatchObject({ workspaceId, ...anthropic });
    expect(await getProvider(db, workspaceId, created.id)).toEqual(created);
    expect(await listProviders(db, workspaceId)).toEqual([created]);
  });

  it('stores a provider without a key', async () => {
    const created = await createProvider(db, workspaceId, {
      type: 'openai-compatible',
      label: 'Ollama',
      encryptedKey: null,
      keyHint: null,
      baseUrl: 'http://127.0.0.1:11434/v1',
    });

    expect(created.encryptedKey).toBeNull();
    expect(created.keyHint).toBeNull();
  });

  it('updates only the given fields', async () => {
    const created = await createProvider(db, workspaceId, anthropic);

    const updated = await updateProvider(db, workspaceId, created.id, {
      encryptedKey: 'v1:new:new:new',
      keyHint: 'wxyz',
    });

    expect(updated).toMatchObject({
      label: 'Claude',
      encryptedKey: 'v1:new:new:new',
      keyHint: 'wxyz',
    });
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    expect(await updateProvider(db, workspaceId, created.id, {})).toEqual(updated);
  });

  it('deletes a provider together with its models', async () => {
    const created = await createProvider(db, workspaceId, anthropic);
    await upsertDiscoveredModels(db, workspaceId, created.id, [
      {
        modelId: 'm1',
        displayName: 'M1',
        capabilities: {
          tools: true,
          vision: false,
          structuredOutput: false,
          promptCaching: false,
          reasoning: false,
          contextWindow: null,
          maxOutput: null,
        },
        enabled: true,
      },
    ]);

    expect(await deleteProvider(db, workspaceId, created.id)).toBe(true);
    expect(await getProvider(db, workspaceId, created.id)).toBeNull();
    expect(await listModels(db, workspaceId)).toEqual([]);
    expect(await deleteProvider(db, workspaceId, created.id)).toBe(false);
  });

  it('hides providers from another workspace', async () => {
    const created = await createProvider(db, workspaceId, anthropic);

    expect(await listProviders(db, strangerId)).toEqual([]);
    expect(await getProvider(db, strangerId, created.id)).toBeNull();
    expect(await updateProvider(db, strangerId, created.id, { label: 'Hacked' })).toBeNull();
    expect(await deleteProvider(db, strangerId, created.id)).toBe(false);
    expect(await getProvider(db, workspaceId, created.id)).toEqual(created);
  });
});
