import type { ProviderType } from '@aievo/shared';
import { and, asc, eq } from 'drizzle-orm';

import type { Db } from '../client.js';
import { providerCredential } from '../schema/index.js';

/** A stored provider. `encryptedKey` must never leave the server; serialise explicitly. */
export type ProviderCredential = typeof providerCredential.$inferSelect;

/** The key arrives already encrypted: this layer never sees plaintext secrets. */
export interface NewProviderInput {
  type: ProviderType;
  label: string;
  encryptedKey: string | null;
  keyHint: string | null;
  baseUrl: string | null;
}

export type ProviderPatch = Partial<Omit<NewProviderInput, 'type'>>;

const inWorkspace = (workspaceId: string, id: string) =>
  and(eq(providerCredential.workspaceId, workspaceId), eq(providerCredential.id, id));

export async function listProviders(db: Db, workspaceId: string): Promise<ProviderCredential[]> {
  return db
    .select()
    .from(providerCredential)
    .where(eq(providerCredential.workspaceId, workspaceId))
    .orderBy(asc(providerCredential.createdAt), asc(providerCredential.label));
}

export async function getProvider(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<ProviderCredential | null> {
  const [row] = await db.select().from(providerCredential).where(inWorkspace(workspaceId, id));
  return row ?? null;
}

export async function createProvider(
  db: Db,
  workspaceId: string,
  input: NewProviderInput,
): Promise<ProviderCredential> {
  const [row] = await db
    .insert(providerCredential)
    .values({ workspaceId, ...input })
    .returning();
  if (!row) throw new Error('Provider insert returned no row');
  return row;
}

/** Returns `null` when the provider does not exist in the workspace. */
export async function updateProvider(
  db: Db,
  workspaceId: string,
  id: string,
  patch: ProviderPatch,
): Promise<ProviderCredential | null> {
  const values: Partial<typeof providerCredential.$inferInsert> = {};
  if (patch.label !== undefined) values.label = patch.label;
  if (patch.encryptedKey !== undefined) values.encryptedKey = patch.encryptedKey;
  if (patch.keyHint !== undefined) values.keyHint = patch.keyHint;
  if (patch.baseUrl !== undefined) values.baseUrl = patch.baseUrl;

  if (Object.keys(values).length === 0) return getProvider(db, workspaceId, id);

  const [row] = await db
    .update(providerCredential)
    .set(values)
    .where(inWorkspace(workspaceId, id))
    .returning();
  return row ?? null;
}

/** Deletes the provider and, by cascade, its models. */
export async function deleteProvider(db: Db, workspaceId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(providerCredential)
    .where(inWorkspace(workspaceId, id))
    .returning({ id: providerCredential.id });
  return rows.length > 0;
}
