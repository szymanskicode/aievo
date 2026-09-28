import type { ProjectSettings, TestPolicy } from '@aievo/shared';
import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.js';
import { workspace } from './workspace.js';

export const project = pgTable(
  'project',
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    description: text().notNull().default(''),
    repoUrl: text(),
    defaultBranch: text().notNull().default('main'),
    settings: jsonb().$type<ProjectSettings>().notNull(),
    testPolicy: jsonb().$type<TestPolicy>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.workspaceId)],
);
