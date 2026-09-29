import { checkAgentModel } from '@aievo/shared';
import type { ModelCapabilities, ModelCapabilitiesPatch, ModelCapabilityFlag } from '@aievo/shared';
import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';

import type { Db } from '../client.js';
import { model, providerCredential } from '../schema/index.js';

export type Model = typeof model.$inferSelect;

export interface ModelFilter {
  providerId?: string;
}

/** A model reported by a provider during a connection test. */
export interface DiscoveredModelInput {
  modelId: string;
  displayName: string;
  capabilities: ModelCapabilities;
  enabled: boolean;
}

export interface ModelPatch {
  displayName?: string;
  capabilities?: ModelCapabilitiesPatch;
  priceIn?: number | null;
  priceOut?: number | null;
  enabled?: boolean;
}

const inWorkspace = (workspaceId: string, id: string) =>
  and(eq(model.workspaceId, workspaceId), eq(model.id, id));

/**
 * Models grouped by provider in the order the providers are listed (oldest first, as in
 * `listProviders`), then by model id, so the order is stable and readable.
 */
export async function listModels(
  db: Db,
  workspaceId: string,
  filter: ModelFilter = {},
): Promise<Model[]> {
  return db
    .select(getTableColumns(model))
    .from(model)
    .innerJoin(
      providerCredential,
      and(
        eq(providerCredential.id, model.providerId),
        eq(providerCredential.workspaceId, model.workspaceId),
      ),
    )
    .where(
      and(
        eq(model.workspaceId, workspaceId),
        filter.providerId === undefined ? undefined : eq(model.providerId, filter.providerId),
      ),
    )
    .orderBy(
      asc(providerCredential.createdAt),
      asc(providerCredential.label),
      asc(providerCredential.id),
      asc(model.modelId),
    );
}

export async function getModel(db: Db, workspaceId: string, id: string): Promise<Model | null> {
  const [row] = await db.select().from(model).where(inWorkspace(workspaceId, id));
  return row ?? null;
}

export type AgentModelCheck =
  | { status: 'ready'; model: Model }
  | { status: 'not_chosen' }
  | { status: 'unusable'; reason: string };

/**
 * Whether the model `modelId` (chosen for an agent in the workspace settings; `null` when
 * none is) exists in the workspace and can run an agent requiring `required`.
 */
export async function checkModelForAgent(
  db: Db,
  workspaceId: string,
  modelId: string | null,
  required: readonly ModelCapabilityFlag[],
): Promise<AgentModelCheck> {
  if (modelId === null) return { status: 'not_chosen' };
  const found = await getModel(db, workspaceId, modelId);
  if (!found) return { status: 'unusable', reason: 'The model does not exist in this workspace' };
  const reason = checkAgentModel(found, required);
  return reason ? { status: 'unusable', reason } : { status: 'ready', model: found };
}

/**
 * Saves models found at the provider. New models are inserted as discovered; for known ones
 * only the display name is refreshed, so capabilities, prices and `enabled` edited by the
 * user survive the next test. Models the provider no longer reports are kept.
 *
 * The caller must have checked that the provider belongs to the workspace; the composite
 * foreign key rejects a mismatch anyway.
 */
export async function upsertDiscoveredModels(
  db: Db,
  workspaceId: string,
  providerId: string,
  models: readonly DiscoveredModelInput[],
): Promise<Model[]> {
  // One statement cannot upsert the same row twice, so a model reported more than once
  // (e.g. on overlapping pages) is saved as first reported.
  const unique = models.filter(
    (entry, index) => models.findIndex((other) => other.modelId === entry.modelId) === index,
  );

  if (unique.length > 0) {
    await db
      .insert(model)
      .values(unique.map((entry) => ({ workspaceId, providerId, ...entry })))
      .onConflictDoUpdate({
        target: [model.providerId, model.modelId],
        set: { displayName: sql`excluded.display_name` },
      });
  }
  return listModels(db, workspaceId, { providerId });
}

/** Returns `null` when the model does not exist in the workspace. */
export async function updateModel(
  db: Db,
  workspaceId: string,
  id: string,
  patch: ModelPatch,
): Promise<Model | null> {
  const values: PgUpdateSetSource<typeof model> = {};
  if (patch.displayName !== undefined) values.displayName = patch.displayName;
  if (patch.priceIn !== undefined) values.priceIn = patch.priceIn;
  if (patch.priceOut !== undefined) values.priceOut = patch.priceOut;
  if (patch.enabled !== undefined) values.enabled = patch.enabled;
  if (patch.capabilities !== undefined && Object.keys(patch.capabilities).length > 0) {
    // Merged in the database, so concurrent edits of different capabilities do not clash.
    values.capabilities = sql`${model.capabilities} || ${JSON.stringify(patch.capabilities)}::jsonb`;
  }

  if (Object.keys(values).length === 0) return getModel(db, workspaceId, id);

  const [row] = await db.update(model).set(values).where(inWorkspace(workspaceId, id)).returning();
  return row ?? null;
}
