import { randomBytes } from 'node:crypto';

import {
  createProvider,
  updateModel,
  updateWorkspaceSettings,
  upsertDiscoveredModels,
} from '@aievo/db';
import type { Db } from '@aievo/db';
import { closeTestDb, createWorkspace, getTestDb, resetDb } from '@aievo/db/testing';
import { loadAgentPreset } from '@aievo/presets';
import type { LoadedAgentPreset } from '@aievo/presets';
import { modelCapabilitiesSchema } from '@aievo/shared';
import { createSecretBox, keyHint } from '@aievo/shared/crypto';
import type { SecretBox } from '@aievo/shared/crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createAgentModelOpener } from './agent-model.js';
import type { OpenAgentModel } from './agent-model.js';
import { RunFailure } from './run-failure.js';

let db: Db;
let secretBox: SecretBox;
let workspaceId: string;
let coder: LoadedAgentPreset;
let open: OpenAgentModel;

beforeAll(async () => {
  coder = await loadAgentPreset('coder');
});

beforeEach(async () => {
  db = getTestDb();
  await resetDb(db);
  workspaceId = await createWorkspace(db);
  secretBox = createSecretBox(randomBytes(32));
  open = createAgentModelOpener(db, secretBox);
});

afterAll(closeTestDb);

/** A fake key that exists only inside this test process. */
const fakeKey = () => `sk-test-${randomBytes(16).toString('hex')}`;

async function insertModel(options: { key?: string; tools?: boolean; priced?: boolean } = {}) {
  const key = options.key ?? fakeKey();
  const provider = await createProvider(db, workspaceId, {
    type: 'anthropic',
    label: 'Anthropic',
    encryptedKey: secretBox.encrypt(key),
    keyHint: keyHint(key),
    baseUrl: null,
  });
  const [model] = await upsertDiscoveredModels(db, workspaceId, provider.id, [
    {
      modelId: 'claude-test',
      displayName: 'Claude Test',
      capabilities: modelCapabilitiesSchema.parse({ tools: options.tools ?? true }),
      enabled: true,
    },
  ]);
  await updateModel(db, workspaceId, model!.id, {
    priceIn: options.priced === false ? null : 3,
    priceOut: 15,
  });
  return model!;
}

async function choose(modelId: string | null) {
  await updateWorkspaceSettings(db, workspaceId, { agentModels: { coder: modelId } });
}

async function failure(promise: Promise<unknown>): Promise<RunFailure> {
  const error = await promise.catch((caught: unknown) => caught);
  if (!(error instanceof RunFailure))
    throw new Error(`Expected a RunFailure, got ${String(error)}`);
  return error;
}

describe('createAgentModelOpener', () => {
  it('opens the chosen model with its pricing and a client', async () => {
    const model = await insertModel();
    await choose(model.id);

    const opened = await open(workspaceId, coder);

    expect(opened).toMatchObject({
      modelId: 'claude-test',
      displayName: 'Claude Test',
      pricing: { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
    });
    expect(typeof opened.llm.chat).toBe('function');
  });

  it('fails when no model is chosen', async () => {
    const error = await failure(open(workspaceId, coder));

    expect(error.code).toBe('agent_model_missing');
    expect(error.message).toMatch(/Programista/);
  });

  it('fails when the chosen model cannot run the agent', async () => {
    await choose((await insertModel({ tools: false })).id);
    expect((await failure(open(workspaceId, coder))).message).toMatch(/capabilities: tools/);

    await choose((await insertModel({ priced: false })).id);
    expect((await failure(open(workspaceId, coder))).code).toBe('agent_model_unusable');
  });

  it('fails when the provider key cannot be decrypted, without the key in the message', async () => {
    const key = fakeKey();
    await choose((await insertModel({ key })).id);
    const opener = createAgentModelOpener(db, createSecretBox(randomBytes(32)));

    const error = await failure(opener(workspaceId, coder));

    expect(error.code).toBe('provider_key_unreadable');
    expect(error.message).not.toContain(key);
  });
});
