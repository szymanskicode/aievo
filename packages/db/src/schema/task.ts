import { doublePrecision, foreignKey, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.js';
import { taskPriorityEnum, taskStatusEnum, taskTypeEnum } from './enums.js';
import { project } from './project.js';

// No `workspaceId` column: a task belongs to a workspace through its project.
export const task = pgTable(
  'task',
  {
    id: id(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    description: text().notNull().default(''),
    type: taskTypeEnum().notNull().default('feature'),
    priority: taskPriorityEnum().notNull().default('medium'),
    status: taskStatusEnum().notNull().default('draft'),
    acceptanceCriteria: text().notNull().default(''),
    labels: text().array().notNull().default([]),
    // Float so a card can be dropped between two others without renumbering.
    position: doublePrecision().notNull(),
    parentId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Deleting a parent keeps its subtasks as top-level tasks.
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id] }).onDelete('set null'),
    index().on(t.projectId),
    index().on(t.projectId, t.status, t.position),
  ],
);
