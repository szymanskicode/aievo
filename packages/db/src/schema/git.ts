import { index, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.js';
import { gitProviderEnum } from './enums.js';
import { workspace } from './workspace.js';

export const gitCredential = pgTable(
  'git_credential',
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    provider: gitProviderEnum().notNull().default('github'),
    label: text().notNull(),
    // `v1:<iv>:<tag>:<ciphertext>` from `@aievo/shared/crypto` (AES-256-GCM), never plaintext.
    encryptedToken: text().notNull(),
    // Last 4 characters shown in the UI; null for tokens too short to hint.
    tokenHint: varchar({ length: 4 }),
    // Account the token authenticates as, read from GitHub when the token is saved.
    githubLogin: text().notNull(),
    // Null when GitHub reports no expiration date.
    expiresAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index().on(t.workspaceId),
    // Target of the composite FK from `project`, which pins a credential to its workspace.
    unique().on(t.id, t.workspaceId),
  ],
);
