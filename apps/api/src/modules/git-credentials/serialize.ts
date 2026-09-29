import type { GitCredential } from '@aievo/db';
import type { GitCredentialDto } from '@aievo/shared';

/**
 * Maps a database row to the API contract. Fields are listed one by one on purpose:
 * `encryptedToken` and `workspaceId` must never be copied into a response.
 */
export function serializeGitCredential(row: GitCredential): GitCredentialDto {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    tokenHint: row.tokenHint,
    githubLogin: row.githubLogin,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
