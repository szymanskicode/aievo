import { randomBytes } from 'node:crypto';

import { ProviderError, computeCostUsd } from '@aievo/llm';
import type {
  LlmClient,
  Message,
  ModelPricing,
  StopReason,
  TextPart,
  ToolCallPart,
  ToolDefinition,
  ToolResultPart,
} from '@aievo/llm';
import { SandboxError } from '@aievo/sandbox';
import { truncateToolResult } from '@aievo/shared';
import type { JsonValue } from '@aievo/shared';

import { CONTINUE_MESSAGE, buildSystemPrompt, buildTaskMessage, wrapData } from './prompt.js';
import { FINISH_DESCRIPTION, FINISH_TOOL, TOOLS } from './tools/index.js';
import { ToolError, describeIssues, toToolDefinition } from './tools/tool.js';
import type { Tool, ToolContext, ToolResult } from './tools/tool.js';
import type {
  AgentError,
  AgentErrorCode,
  AgentOutcome,
  AgentRunInput,
  AgentUsage,
  NativeRuntimeOptions,
} from './types.js';

/** Invalid `finish` results tolerated before the step fails: one chance to fix it. */
const MAX_INVALID_FINISHES = 1;

interface ModelResponse {
  text: string;
  toolCalls: ToolCallPart[];
  stopReason: StopReason | null;
}

class StepFailure extends Error {
  constructor(readonly error: AgentError) {
    super(error.message);
  }
}

function failure(code: AgentErrorCode, message: string, details?: JsonValue): StepFailure {
  return new StepFailure({ code, message, ...(details === undefined ? {} : { details }) });
}

/** The native agent loop (docs/architecture.md section 11). */
export async function runAgentLoop(
  { llm, onToolError }: NativeRuntimeOptions,
  input: AgentRunInput,
): Promise<AgentOutcome> {
  const { agent, limits } = input;
  const usage: AgentUsage = { iterations: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

  const pricing = agent.model.pricing;
  if (!pricing) {
    return {
      status: 'failed',
      error: {
        code: 'model_not_priced',
        message: `The model ${agent.model.id} has no pricing, so its cost cannot be limited. Set its prices first.`,
      },
      usage,
    };
  }

  const timeout = AbortSignal.timeout(limits.maxDurationMs);
  const signal = AbortSignal.any([input.signal, timeout]);
  const tools = new Map<string, Tool>(agent.tools.map((name) => [name, TOOLS[name]]));
  const definitions: ToolDefinition[] = [
    ...[...tools.values()].map(toToolDefinition),
    toToolDefinition({
      name: FINISH_TOOL,
      description: FINISH_DESCRIPTION,
      input: agent.resultSchema,
    }),
  ];
  const token = randomBytes(8).toString('hex');
  const system = buildSystemPrompt(agent.systemPrompt, token);
  const messages: Message[] = [{ role: 'user', content: buildTaskMessage(input.task, token) }];
  const context: ToolContext = {
    sandbox: input.sandbox,
    permissions: agent.permissions,
    commands: input.commands,
    git: input.git,
    limits,
    signal,
  };
  let invalidFinishes = 0;

  try {
    while (usage.iterations < limits.maxIterations) {
      signal.throwIfAborted();
      usage.iterations += 1;
      const iteration = usage.iterations;

      const response = await callModel(llm, input, {
        pricing,
        system,
        messages,
        tools: definitions,
        signal,
        usage,
        iteration,
      });
      const assistant: (TextPart | ToolCallPart)[] = [];
      if (response.text !== '') assistant.push({ type: 'text', text: response.text });
      assistant.push(...response.toolCalls.map(forHistory));
      // An empty assistant turn is refused by some providers; the nudge below follows instead.
      if (assistant.length > 0) messages.push({ role: 'assistant', content: assistant });

      const overBudget = usage.costUsd > limits.maxCostUsd;

      if (response.toolCalls.length === 0) {
        if (overBudget) throw costLimit(usage, limits.maxCostUsd);
        messages.push({ role: 'user', content: CONTINUE_MESSAGE });
        continue;
      }

      const results: ToolResultPart[] = [];
      for (const call of response.toolCalls) {
        const callStarted = Date.now();

        if (call.name === FINISH_TOOL) {
          const parsed = agent.resultSchema.safeParse(call.input);
          if (parsed.success) {
            await input.onEvent(
              toolEvent(iteration, call, { output: 'Result accepted.' }, callStarted),
            );
            return { status: 'succeeded', output: parsed.data, usage };
          }
          invalidFinishes += 1;
          const issues = describeIssues(parsed.error);
          const rejected: ToolResult = {
            output: `The result does not match the schema:\n${issues.map((issue) => `- ${issue}`).join('\n')}\nFix it and call finish again.`,
            isError: true,
          };
          await input.onEvent({ type: 'finish-rejected', iteration, issues });
          await input.onEvent(toolEvent(iteration, call, rejected, callStarted));
          if (invalidFinishes > MAX_INVALID_FINISHES) {
            throw failure('invalid_result', 'The agent returned an invalid result twice.', {
              issues,
            });
          }
          results.push(toResultPart(call, rejected, token));
          continue;
        }

        // Over the budget, nothing else runs; only a valid `finish` above can still end well.
        if (overBudget) continue;

        const result = await executeTool(tools, call, context, onToolError);
        await input.onEvent(toolEvent(iteration, call, result, callStarted));
        results.push(toResultPart(call, result, token));
      }

      if (overBudget) throw costLimit(usage, limits.maxCostUsd);
      messages.push({ role: 'tool', content: results });
    }
    throw failure(
      'iteration_limit',
      `The agent did not finish within ${limits.maxIterations} iterations.`,
    );
  } catch (error) {
    if (error instanceof StepFailure) return { status: 'failed', error: error.error, usage };
    if (signal.aborted) {
      if (input.signal.aborted) {
        return {
          status: 'cancelled',
          error: { code: 'cancelled', message: 'The step was cancelled.' },
          usage,
        };
      }
      return {
        status: 'failed',
        error: {
          code: 'time_limit',
          message: `The step exceeded its time limit of ${formatDuration(limits.maxDurationMs)}.`,
        },
        usage,
      };
    }
    if (error instanceof ProviderError) {
      return {
        status: 'failed',
        error: { code: 'model_error', message: error.message, details: { kind: error.kind } },
        usage,
      };
    }
    throw error;
  }
}

interface ModelCall {
  pricing: ModelPricing;
  system: string;
  messages: Message[];
  tools: ToolDefinition[];
  signal: AbortSignal;
  /** Totals of the step, updated with this call's tokens and cost. */
  usage: AgentUsage;
  iteration: number;
}

/** One model response, collected from the stream and reported as a `model-response` event. */
async function callModel(
  llm: LlmClient,
  input: AgentRunInput,
  { pricing, system, messages, tools, signal, usage, iteration }: ModelCall,
): Promise<ModelResponse> {
  const { agent } = input;
  const started = Date.now();
  let text = '';
  const toolCalls: ToolCallPart[] = [];
  let stopReason: StopReason | null = null;
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

  for await (const event of llm.chat({
    model: agent.model.id,
    system,
    messages,
    tools,
    signal,
    pricing,
    ...(agent.maxTokens === undefined ? {} : { maxTokens: agent.maxTokens }),
    ...(agent.temperature === undefined ? {} : { temperature: agent.temperature }),
  })) {
    switch (event.type) {
      case 'text-delta':
        text += event.text;
        break;
      case 'tool-call':
        toolCalls.push({ type: 'tool-call', id: event.id, name: event.name, input: event.input });
        break;
      case 'usage':
        tokens.input += event.inputTokens ?? 0;
        tokens.output += event.outputTokens ?? 0;
        tokens.cacheRead += event.cacheReadTokens ?? 0;
        tokens.cacheWrite += event.cacheWriteTokens ?? 0;
        tokens.cost += event.costUsd ?? computeCostUsd(event, pricing);
        break;
      case 'stop':
        stopReason = event.reason;
        break;
    }
  }

  usage.inputTokens += tokens.input;
  usage.outputTokens += tokens.output;
  usage.costUsd += tokens.cost;
  await input.onEvent({
    type: 'model-response',
    iteration,
    text,
    toolCalls: toolCalls.length,
    stopReason,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    cacheReadTokens: tokens.cacheRead,
    cacheWriteTokens: tokens.cacheWrite,
    costUsd: tokens.cost,
    totalCostUsd: usage.costUsd,
    durationMs: Date.now() - started,
  });
  return { text, toolCalls, stopReason };
}

/** Runs one tool call. Every failure becomes an error result for the model, except an abort. */
async function executeTool(
  tools: Map<string, Tool>,
  call: ToolCallPart,
  context: ToolContext,
  onToolError: NativeRuntimeOptions['onToolError'],
): Promise<ToolResult> {
  const tool = tools.get(call.name);
  if (!tool) {
    const available = [...tools.keys(), FINISH_TOOL].join(', ');
    return { output: `Unknown tool "${call.name}". Available tools: ${available}.`, isError: true };
  }
  const args = tool.input.safeParse(call.input);
  if (!args.success) {
    return {
      output: `Invalid arguments for ${call.name}:\n${describeIssues(args.error)
        .map((issue) => `- ${issue}`)
        .join('\n')}`,
      isError: true,
    };
  }
  try {
    return await tool.execute(args.data, context);
  } catch (error) {
    if (context.signal.aborted) throw error;
    if (error instanceof ToolError || error instanceof SandboxError) {
      return { output: error.message, isError: true };
    }
    // Unexpected errors may carry host details; the model only learns that the tool broke.
    onToolError?.(error, { tool: call.name, callId: call.id });
    return { output: `The ${call.name} tool failed unexpectedly.`, isError: true };
  }
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${Math.round(ms / 1000)} s`;
}

function costLimit(usage: AgentUsage, max: number): StepFailure {
  return failure(
    'cost_limit',
    `The step cost ${usage.costUsd.toFixed(4)} USD, over its limit of ${max} USD.`,
    { costUsd: usage.costUsd, maxCostUsd: max },
  );
}

/**
 * The tool call as kept in the conversation. Providers require an object as tool input
 * (Anthropic refuses anything else), so input that is not one, e.g. the raw text of broken
 * JSON, is replaced by `{}`; the tool result already tells the model what was wrong.
 */
function forHistory(call: ToolCallPart): ToolCallPart {
  const input = call.input;
  const isObject = typeof input === 'object' && input !== null && !Array.isArray(input);
  return isObject ? call : { ...call, input: {} };
}

function toJson(value: unknown): JsonValue {
  // Tool input comes from parsed JSON; anything else (a raw string of broken JSON) stays as is.
  return value === undefined ? null : (value as JsonValue);
}

function toolEvent(iteration: number, call: ToolCallPart, result: ToolResult, started: number) {
  return {
    type: 'tool-call' as const,
    iteration,
    callId: call.id,
    tool: call.name,
    args: toJson(call.input),
    result: truncateToolResult(result.output),
    isError: result.isError ?? false,
    durationMs: Date.now() - started,
    exitCode: result.exitCode ?? null,
  };
}

function toResultPart(call: ToolCallPart, result: ToolResult, token: string): ToolResultPart {
  return {
    type: 'tool-result',
    callId: call.id,
    name: call.name,
    output: wrapData(`tool=${call.name}`, truncateToolResult(result.output), token),
    isError: result.isError ?? false,
  };
}
