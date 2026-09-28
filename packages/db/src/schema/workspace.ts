import type { WorkspaceLimits, WorkspaceSettings } from '@aievo/shared';
import { index, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.js';
import { membershipRoleEnum } from './enums.js';

export const workspace = pgTable('workspace', {
  id: id(),
  name: text().notNull(),
  settings: jsonb().$type<WorkspaceSettings>().notNull(),
  limits: jsonb().$type<WorkspaceLimits>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const user = pgTable('user', {
  id: id(),
  email: text().unique(),
  displayName: text().notNull(),
  createdAt: createdAt(),
});

export const membership = pgTable(
  'membership',
  {
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: membershipRoleEnum().notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index().on(t.userId)],
);
