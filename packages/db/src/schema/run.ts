import type { JsonValue } from '@aievo/shared';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns.js';
import { runStatusEnum, stepStatusEnum } from './enums.js';
import { task } from './task.js';

const costUsd = () => numeric({ precision: 12, scale: 6, mode: 'number' }).notNull().default(0);
const tokens = () => integer().notNull().default(0);

// No `workspaceId` columns: a run belongs to a workspace through task → project,
// and steps and tool calls through their run.
export const run = pgTable(
  'run',
  {
    id: id(),
    taskId: uuid()
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    status: runStatusEnum().notNull().default('queued'),
    branch: text(),
    prUrl: text(),
    prNumber: integer(),
    costUsd: costUsd(),
    tokensIn: tokens(),
    tokensOut: tokens(),
    // Why the run failed: `{ code, message, ... }`, never secrets or raw provider output.
    error: jsonb().$type<JsonValue>(),
    startedAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.taskId, t.createdAt)],
);

export const step = pgTable(
  'step',
  {
    id: id(),
    runId: uuid()
      .notNull()
      .references(() => run.id, { onDelete: 'cascade' }),
    stepKey: text().notNull(),
    agentKey: text().notNull(),
    // Hash of the agent preset file the step ran with, so later edits do not rewrite history.
    agentVersion: text().notNull(),
    iteration: integer().notNull().default(1),
    status: stepStatusEnum().notNull().default('queued'),
    input: jsonb().$type<JsonValue>(),
    output: jsonb().$type<JsonValue>(),
    costUsd: costUsd(),
    tokensIn: tokens(),
    tokensOut: tokens(),
    startedAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    // Stable order of steps, including those that never started.
    createdAt: createdAt(),
  },
  (t) => [index().on(t.runId, t.createdAt)],
);

export const toolCall = pgTable(
  'tool_call',
  {
    id: id(),
    stepId: uuid()
      .notNull()
      .references(() => step.id, { onDelete: 'cascade' }),
    tool: text().notNull(),
    args: jsonb().$type<JsonValue>().notNull(),
    // Cut to `TOOL_RESULT_MAX_CHARS` with `truncateToolResult` before it is stored.
    result: text().notNull(),
    isError: boolean().notNull().default(false),
    durationMs: integer().notNull(),
    exitCode: integer(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.stepId, t.createdAt)],
);
