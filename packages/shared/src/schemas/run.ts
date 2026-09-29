import { z } from 'zod';

import { runStatusSchema } from './enums.js';
import type { RunStatus } from './enums.js';

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
export const runErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
  })
  .meta({ id: 'RunError' });

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
    error: runErrorSchema.nullable(),
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
