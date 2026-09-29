import type { ProjectSettings, TestPolicy } from '@aievo/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.js';
import { gitCredential } from './git.js';
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
    // GitHub repository the project works on; both set or both null.
    repoOwner: text(),
    repoName: text(),
    gitCredentialId: uuid(),
    settings: jsonb().$type<ProjectSettings>().notNull(),
    testPolicy: jsonb().$type<TestPolicy>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index().on(t.workspaceId),
    // Composite, so a project can only use a credential of its own workspace. RESTRICT: a
    // credential in use cannot be deleted, which would silently break the project.
    foreignKey({
      columns: [t.gitCredentialId, t.workspaceId],
      foreignColumns: [gitCredential.id, gitCredential.workspaceId],
    }).onDelete('restrict'),
    check('project_repo_owner_name_check', sql`(${t.repoOwner} IS NULL) = (${t.repoName} IS NULL)`),
    // One project per repository in a workspace; GitHub names are case-insensitive.
    // Projects without a repository have NULLs here, which never collide.
    uniqueIndex('project_workspace_repo_unique').on(
      t.workspaceId,
      sql`lower(${t.repoOwner})`,
      sql`lower(${t.repoName})`,
    ),
  ],
);
