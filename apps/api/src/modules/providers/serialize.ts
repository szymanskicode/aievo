import type { ProviderCredential } from '@aievo/db';
import type { ProviderDto } from '@aievo/shared';

/**
 * Maps a database row to the API contract. Fields are listed one by one on purpose:
 * `encryptedKey` and `workspaceId` must never be copied into a response.
 */
export function serializeProvider(row: ProviderCredential): ProviderDto {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    hasKey: row.encryptedKey !== null,
    keyHint: row.keyHint,
    baseUrl: row.baseUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
