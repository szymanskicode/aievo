import type { LlmClient, ModelPricing, StopReason } from '@aievo/llm';
import type { Sandbox } from '@aievo/sandbox';
import type { JsonValue } from '@aievo/shared';
import type { z } from 'zod';

/** Tools an agent can be given; `finish` is always added. */
export const TOOL_NAMES = [
  'list_files',
  'read_file',
  'search_code',
  'write_file',
  'edit_file',
  'run_command',
  'git_diff',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface AgentPermissions {
  /**
   * Globs (relative to `/workspace`) the agent may write; `null` means no writes at all.
   * `.git` is never writable.
   */
  writeGlobs: string[] | null;
}

export interface AgentConfig {
  key: string;
  systemPrompt: string;
  tools: ToolName[];
  permissions: AgentPermissions;
  /** Schema of the `finish` input: the result of the step. */
  resultSchema: z.ZodType;
  model: {
    id: string;
    /** Without pricing the cost limit cannot be enforced, so such a model is refused. */
    pricing: ModelPricing | null;
  };
  maxTokens?: number;
  temperature?: number;
}

export interface Limits {
  /** Model responses per step. */
  maxIterations: number;
  maxCostUsd: number;
  maxDurationMs: number;
  /** Limit of one `run_command`. */
  commandTimeoutMs: number;
}

/** Starting values from docs/architecture.md section 15; the run limit (5 USD) is the worker's. */
export const DEFAULT_LIMITS: Readonly<Limits> = {
  maxIterations: 30,
  maxCostUsd: 1,
  maxDurationMs: 30 * 60 * 1000,
  commandTimeoutMs: 10 * 60 * 1000,
};

export interface TaskContext {
  title: string;
  description: string;
  acceptanceCriteria?: string[];
  /** Extra project context (conventions, artifacts of earlier steps). */
  context?: string;
}

export interface AgentRunInput {
  agent: AgentConfig;
  task: TaskContext;
  sandbox: Sandbox;
  /**
   * Commands `run_command` accepts: the project's commands and the configured extra ones.
   * An allowed command may be followed by plain arguments (no shell syntax).
   */
  commands: { allowed: string[] };
  /** Ref `git_diff` compares against, e.g. `origin/main`. */
  git: { baseRef: string };
  limits: Limits;
  signal: AbortSignal;
  /** Awaited before the loop goes on, so the caller can persist every event in order. */
  onEvent: (event: AgentEvent) => Promise<void>;
}

export type AgentEvent =
  | {
      type: 'model-response';
      iteration: number;
      /** The whole text of the response (not the deltas). */
      text: string;
      toolCalls: number;
      stopReason: StopReason | null;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      costUsd: number;
      /** Cost of the step so far. */
      totalCostUsd: number;
      durationMs: number;
    }
  | {
      type: 'tool-call';
      iteration: number;
      callId: string;
      tool: string;
      args: JsonValue;
      /** What the model received, already cut to `TOOL_RESULT_MAX_CHARS`. */
      result: string;
      isError: boolean;
      durationMs: number;
      exitCode: number | null;
    }
  | { type: 'finish-rejected'; iteration: number; issues: string[] };

export type AgentErrorCode =
  | 'model_not_priced'
  | 'iteration_limit'
  | 'cost_limit'
  | 'time_limit'
  | 'invalid_result'
  | 'model_error'
  | 'cancelled';

export interface AgentError {
  code: AgentErrorCode;
  /** Safe to store and show: no secrets, no raw provider output. */
  message: string;
  details?: JsonValue;
}

export interface AgentUsage {
  iterations: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export type AgentOutcome =
  | { status: 'succeeded'; output: unknown; usage: AgentUsage }
  | { status: 'failed' | 'cancelled'; error: AgentError; usage: AgentUsage };

/** How an agent does its work (docs/architecture.md section 9); `native` is the loop here. */
export interface AgentRuntime {
  run(input: AgentRunInput): Promise<AgentOutcome>;
}

export interface NativeRuntimeOptions {
  llm: LlmClient;
}
