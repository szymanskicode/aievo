import type { GitProvider } from '@aievo/shared';
import { and, asc, eq } from 'drizzle-orm';

import type { Db } from '../client.js';
import { RowInUseError, isForeignKeyViolation } from '../errors.js';
import { gitCredential } from '../schema/index.js';

/** A stored Git credential. `encryptedToken` must never leave the server; serialise explicitly. */
export type GitCredential = typeof gitCredential.$inferSelect;

/** The token arrives already encrypted: this layer never sees plaintext secrets. */
export interface NewGitCredentialInput {
  provider?: GitProvider;
  label: string;
  encryptedToken: string;
  tokenHint: string | null;
  githubLogin: string;
  expiresAt: Date | null;
}

const inWorkspace = (workspaceId: string, id: string) =>
  and(eq(gitCredential.workspaceId, workspaceId), eq(gitCredential.id, id));

export async function listGitCredentials(db: Db, workspaceId: string): Promise<GitCredential[]> {
  return db
    .select()
    .from(gitCredential)
    .where(eq(gitCredential.workspaceId, workspaceId))
    .orderBy(asc(gitCredential.createdAt), asc(gitCredential.label));
}

export async function getGitCredential(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<GitCredential | null> {
  const [row] = await db.select().from(gitCredential).where(inWorkspace(workspaceId, id));
  return row ?? null;
}

export async function createGitCredential(
  db: Db,
  workspaceId: string,
  input: NewGitCredentialInput,
): Promise<GitCredential> {
  const [row] = await db
    .insert(gitCredential)
    .values({ workspaceId, ...input })
    .returning();
  if (!row) throw new Error('Git credential insert returned no row');
  return row;
}

/**
 * Returns `false` when the credential does not exist in the workspace and throws
 * `RowInUseError` when a project still uses it.
 */
export async function deleteGitCredential(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  try {
    const rows = await db
      .delete(gitCredential)
      .where(inWorkspace(workspaceId, id))
      .returning({ id: gitCredential.id });
    return rows.length > 0;
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new RowInUseError('The Git credential is used by a project', { cause: error });
    }
    throw error;
  }
}
