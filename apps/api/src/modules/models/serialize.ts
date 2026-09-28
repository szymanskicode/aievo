import type { Model } from '@aievo/db';
import type { ModelDto } from '@aievo/shared';

/** Maps a database row to the API contract; `workspaceId` stays server-side. */
export function serializeModel(row: Model): ModelDto {
  return {
    id: row.id,
    providerId: row.providerId,
    modelId: row.modelId,
    displayName: row.displayName,
    capabilities: row.capabilities,
    priceIn: row.priceIn,
    priceOut: row.priceOut,
    enabled: row.enabled,
  };
}
