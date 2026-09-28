import {
  createProvider,
  deleteProvider,
  getProvider,
  listProviders,
  updateProvider,
  upsertDiscoveredModels,
} from '@aievo/db';
import type { ProviderPatch } from '@aievo/db';
import { listModels as discoverModels } from '@aievo/llm';
import {
  createProviderSchema,
  idParamsSchema,
  missingProviderFields,
  providerSchema,
  providerTestResultSchema,
  providerTypeInfoList,
  providerTypeInfoSchema,
  updateProviderSchema,
} from '@aievo/shared';
import { keyHint } from '@aievo/shared/crypto';
import type { SecretBox } from '@aievo/shared/crypto';
import { z } from 'zod';

import { PROVIDER_ERROR_STATUSES, missingFieldsError, resourceNotFound } from '../../errors.js';
import { defineRoute, definePublicRoute } from '../../http/route.js';
import { serializeModel } from '../models/serialize.js';
import { serializeProvider } from './serialize.js';

const tag = 'providers';

/** The only place where a plaintext key is turned into what the database stores. */
function sealKey(secretBox: SecretBox, apiKey: string | null) {
  return apiKey === null
    ? { encryptedKey: null, keyHint: null }
    : { encryptedKey: secretBox.encrypt(apiKey), keyHint: keyHint(apiKey) };
}

export const providerRoutes = [
  definePublicRoute(
    {
      method: 'get',
      path: '/provider-types',
      summary: 'List supported provider types and the fields they need',
      tag,
      status: 200,
      response: z.array(providerTypeInfoSchema),
    },
    () => [...providerTypeInfoList],
  ),

  defineRoute(
    {
      method: 'get',
      path: '/providers',
      summary: 'List model providers',
      tag,
      status: 200,
      response: z.array(providerSchema),
    },
    async ({ db, workspaceId }) => (await listProviders(db, workspaceId)).map(serializeProvider),
  ),

  defineRoute(
    {
      method: 'post',
      path: '/providers',
      summary: 'Add a model provider; the key is stored encrypted and never returned',
      tag,
      body: createProviderSchema,
      status: 201,
      response: providerSchema,
    },
    async ({ db, secretBox, workspaceId, body }) => {
      const row = await createProvider(db, workspaceId, {
        type: body.type,
        label: body.label,
        baseUrl: body.baseUrl ?? null,
        ...sealKey(secretBox, body.apiKey ?? null),
      });
      return serializeProvider(row);
    },
  ),

  defineRoute(
    {
      method: 'patch',
      path: '/providers/:id',
      summary: 'Update a model provider; a new key replaces the stored one',
      tag,
      params: idParamsSchema,
      body: updateProviderSchema,
      status: 200,
      response: providerSchema,
      errors: [404],
    },
    async ({ db, secretBox, workspaceId, params, body }) => {
      const current = await getProvider(db, workspaceId, params.id);
      if (!current) throw resourceNotFound('Provider');

      const missing = missingProviderFields(current.type, {
        apiKey: body.apiKey === undefined ? current.encryptedKey !== null : body.apiKey !== null,
        baseUrl: body.baseUrl === undefined ? current.baseUrl !== null : body.baseUrl !== null,
      });
      if (missing.length > 0) {
        throw missingFieldsError(missing, `Required for provider type ${current.type}`);
      }

      // A stored key never follows the provider to a new address: otherwise one PATCH and
      // one connection test would send the key to any host. The caller must enter it again.
      const movesStoredKey =
        body.baseUrl !== undefined &&
        body.baseUrl !== current.baseUrl &&
        current.encryptedKey !== null &&
        body.apiKey === undefined;
      if (movesStoredKey) {
        throw missingFieldsError(['apiKey'], 'Enter the API key again when changing the base URL');
      }

      const patch: ProviderPatch = {};
      if (body.label !== undefined) patch.label = body.label;
      if (body.baseUrl !== undefined) patch.baseUrl = body.baseUrl;
      if (body.apiKey !== undefined) Object.assign(patch, sealKey(secretBox, body.apiKey));

      const row = await updateProvider(db, workspaceId, params.id, patch);
      if (!row) throw resourceNotFound('Provider');
      return serializeProvider(row);
    },
  ),

  defineRoute(
    {
      method: 'delete',
      path: '/providers/:id',
      summary: 'Delete a model provider and its models',
      tag,
      params: idParamsSchema,
      status: 204,
      errors: [404],
    },
    async ({ db, workspaceId, params }) => {
      if (!(await deleteProvider(db, workspaceId, params.id))) throw resourceNotFound('Provider');
    },
  ),

  defineRoute(
    {
      method: 'post',
      path: '/providers/:id/test',
      summary: 'Test the connection and save the models the provider reports',
      tag,
      params: idParamsSchema,
      status: 200,
      response: providerTestResultSchema,
      errors: [404, ...PROVIDER_ERROR_STATUSES],
    },
    async ({ db, secretBox, workspaceId, params }) => {
      const provider = await getProvider(db, workspaceId, params.id);
      if (!provider) throw resourceNotFound('Provider');

      // The plaintext key exists only for the duration of this call.
      const discovered = await discoverModels({
        type: provider.type,
        apiKey: provider.encryptedKey === null ? null : secretBox.decrypt(provider.encryptedKey),
        baseUrl: provider.baseUrl,
      });
      const models = await upsertDiscoveredModels(db, workspaceId, provider.id, discovered);

      return { discovered: discovered.length, models: models.map(serializeModel) };
    },
  ),
];
