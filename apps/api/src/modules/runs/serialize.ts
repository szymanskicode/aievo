import type { Run, Step, ToolCall, ToolCallPage } from '@aievo/db';
import { coderResultSchema, runErrorSchema } from '@aievo/shared';
import type { RunDto, StepDto, ToolCallDto, ToolCallPageDto } from '@aievo/shared';
import { z } from 'zod';

export function serializeRun(row: Run): RunDto {
  // `error` is written by the worker as `{ code, message }`; anything else is not returned.
  const error = runErrorSchema.safeParse(row.error);
  return {
    id: row.id,
    taskId: row.taskId,
    status: row.status,
    branch: row.branch,
    prUrl: row.prUrl,
    prNumber: row.prNumber,
    costUsd: row.costUsd,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    error: error.success ? { code: error.data.code, message: error.data.message } : null,
    cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeToolCall(row: ToolCall): ToolCallDto {
  const args = row.args;
  return {
    id: row.id,
    stepId: row.stepId,
    tool: row.tool,
    args:
      args !== null && typeof args === 'object' && !Array.isArray(args) ? args : { value: args },
    result: row.result,
    isError: row.isError,
    durationMs: row.durationMs,
    exitCode: row.exitCode,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeToolCallPage(page: ToolCallPage): ToolCallPageDto {
  return { items: page.items.map(serializeToolCall), nextCursor: page.nextCursor };
}

const stepOutputSchema = z.object({
  result: coderResultSchema.optional().catch(undefined),
  error: runErrorSchema.optional().catch(undefined),
  usage: z.object({ iterations: z.number().int() }).optional().catch(undefined),
});

export function serializeStep(row: Step, toolCallCount: number, toolCalls: ToolCallPage): StepDto {
  // The worker writes `output`; only the known parts of it are returned, each on its own.
  const parsed = stepOutputSchema.safeParse(row.output);
  const output = parsed.success ? parsed.data : {};
  return {
    id: row.id,
    runId: row.runId,
    stepKey: row.stepKey,
    agentKey: row.agentKey,
    iteration: row.iteration,
    status: row.status,
    costUsd: row.costUsd,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    result: output.result ?? null,
    error: output.error ? { code: output.error.code, message: output.error.message } : null,
    iterations: output.usage?.iterations ?? null,
    toolCallCount,
    toolCalls: serializeToolCallPage(toolCalls),
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
