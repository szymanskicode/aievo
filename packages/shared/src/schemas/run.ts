import { z } from 'zod';

import { coderResultSchema } from './agent.js';
import { runStatusSchema, stepStatusSchema } from './enums.js';
import type { RunStatus } from './enums.js';
import { outputSchema } from './output.js';

/** Statuses of a run that a worker is working on; a project allows a limited number of them. */
export const ACTIVE_RUN_STATUSES = [
  'preparing',
  'running',
  'committing',
] as const satisfies readonly RunStatus[];

/** Statuses a run never leaves. */
export const FINAL_RUN_STATUSES = [
  'succeeded',
  'failed',
  'cancelled',
] as const satisfies readonly RunStatus[];

export function isFinalRunStatus(status: RunStatus): boolean {
  return (FINAL_RUN_STATUSES as readonly RunStatus[]).includes(status);
}

/** Why a run failed, stored in `run.error`. Never contains secrets or raw provider output. */
const runErrorShape = z.object({
  code: z.string(),
  message: z.string(),
});

export const runErrorSchema = runErrorShape.meta({ id: 'RunError' });

/**
 * Nullable fields use schemas without an OpenAPI id: the generator drops `null` from a
 * nullable reference to a named component.
 */
const nullableRunError = runErrorShape.nullable();

export type RunError = z.infer<typeof runErrorSchema>;

/** A run as returned by the API. */
export const runSchema = z
  .object({
    id: z.uuid(),
    taskId: z.uuid(),
    status: runStatusSchema,
    branch: z.string().nullable(),
    prUrl: z.string().nullable(),
    prNumber: z.number().int().nullable(),
    costUsd: z.number(),
    tokensIn: z.number().int(),
    tokensOut: z.number().int(),
    error: nullableRunError,
    cancelRequestedAt: z.iso.datetime().nullable(),
    startedAt: z.iso.datetime().nullable(),
    endedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Run' });

export type RunDto = z.infer<typeof runSchema>;

/** Any value that survives a JSON round trip; the type of the JSONB columns of runs. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Longest tool result stored in `tool_call.result`. Command output can be megabytes;
 * the start and the end of it are what an agent and a human need.
 */
export const TOOL_RESULT_MAX_CHARS = 16_000;

/**
 * Shortens `text` to at most `max` characters, keeping its head and tail and marking
 * how much was cut out of the middle.
 */
export function truncateToolResult(text: string, max = TOOL_RESULT_MAX_CHARS): string {
  if (text.length <= max) return text;

  // The marker length depends on the number it contains, so it is sized for the worst case.
  const marker = (omitted: number) => `\n[… ${omitted} characters omitted …]\n`;
  const budget = max - marker(text.length).length;
  // A limit too small for the marker gets a plain cut.
  if (budget <= 0) return text.slice(0, max);
  const head = Math.ceil(budget / 2);
  const tail = budget - head;
  const omitted = text.length - head - tail;

  return text.slice(0, head) + marker(omitted) + text.slice(text.length - tail);
}

/** The latest run of a task, shown on its card: whether an agent works on it and its PR. */
/** Not a named OpenAPI component, so `latestRun` can be nullable (see `nullableRunError`). */
export const runSummarySchema = z.object({
  id: z.uuid(),
  status: runStatusSchema,
  prUrl: z.string().nullable(),
  prNumber: z.number().int().nullable(),
});

export type RunSummaryDto = z.infer<typeof runSummarySchema>;

/** One tool call of a step as returned by the API. */
export const toolCallSchema = z
  .object({
    id: z.uuid(),
    stepId: z.uuid(),
    tool: z.string(),
    /** Arguments the agent passed; a value that is not an object comes as `{ value }`. */
    args: z.record(z.string(), z.unknown()),
    /** Output of the tool, already shortened to `TOOL_RESULT_MAX_CHARS`. */
    result: z.string(),
    isError: z.boolean(),
    durationMs: z.number().int(),
    exitCode: z.number().int().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'ToolCall' });

export type ToolCallDto = z.infer<typeof toolCallSchema>;

/** Largest page of tool calls; the default fits a typical step of the Programista. */
export const TOOL_CALL_PAGE_MAX = 200;
export const TOOL_CALL_PAGE_DEFAULT = 50;

const toolCallLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(TOOL_CALL_PAGE_MAX)
  .default(TOOL_CALL_PAGE_DEFAULT);

/** Query of `GET /runs/:id/steps`: how many tool calls each step comes with. */
export const runStepsQuerySchema = z.strictObject({
  toolCallLimit: toolCallLimitSchema,
});

/** Query of `GET /steps/:id/tool-calls`: the page after the tool call `after`. */
export const toolCallsQuerySchema = z.strictObject({
  after: z.uuid().optional(),
  limit: toolCallLimitSchema,
});

/** A page of tool calls; `nextCursor` is passed as `after` for the next one. */
export const toolCallPageSchema = z
  .object({
    items: z.array(toolCallSchema),
    nextCursor: z.uuid().nullable(),
  })
  .meta({ id: 'ToolCallPage' });

export type ToolCallPageDto = z.infer<typeof toolCallPageSchema>;

/** A step of a run with the first page of its tool calls. */
export const stepSchema = z
  .object({
    id: z.uuid(),
    runId: z.uuid(),
    stepKey: z.string(),
    agentKey: z.string(),
    iteration: z.number().int(),
    status: stepStatusSchema,
    costUsd: z.number(),
    tokensIn: z.number().int(),
    tokensOut: z.number().int(),
    /** What the agent reported with `finish`; `null` until it did. */
    result: outputSchema(coderResultSchema).nullable(),
    /** Why the step failed, when the agent stopped with an error. */
    error: nullableRunError,
    /** Model responses the agent needed, once the step has finished. */
    iterations: z.number().int().nullable(),
    toolCallCount: z.number().int(),
    toolCalls: toolCallPageSchema,
    startedAt: z.iso.datetime().nullable(),
    endedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Step' });

export type StepDto = z.infer<typeof stepSchema>;
