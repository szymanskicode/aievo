import type { ModelCapabilities } from '@aievo/shared';
import {
  boolean,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.js';
import { providerTypeEnum } from './enums.js';
import { workspace } from './workspace.js';

export const providerCredential = pgTable(
  'provider_credential',
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    type: providerTypeEnum().notNull(),
    label: text().notNull(),
    // `v1:<iv>:<tag>:<ciphertext>` from `@aievo/shared/crypto` (AES-256-GCM), never plaintext.
    // Null for providers that work without a key (e.g. a local Ollama).
    encryptedKey: text(),
    // Last 4 characters shown in the UI; null without a key or for keys too short to hint.
    keyHint: varchar({ length: 4 }),
    baseUrl: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index().on(t.workspaceId),
    // Target of the composite FK from `model`, which pins a model to its provider's workspace.
    unique().on(t.id, t.workspaceId),
  ],
);

export const model = pgTable(
  'model',
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    providerId: uuid().notNull(),
    modelId: text().notNull(),
    displayName: text().notNull(),
    capabilities: jsonb().$type<ModelCapabilities>().notNull(),
    // USD per million tokens.
    priceIn: numeric({ precision: 12, scale: 6, mode: 'number' }),
    priceOut: numeric({ precision: 12, scale: 6, mode: 'number' }),
    enabled: boolean().notNull().default(true),
  },
  (t) => [
    foreignKey({
      columns: [t.providerId, t.workspaceId],
      foreignColumns: [providerCredential.id, providerCredential.workspaceId],
    }).onDelete('cascade'),
    index().on(t.workspaceId),
    unique().on(t.providerId, t.modelId),
  ],
);
