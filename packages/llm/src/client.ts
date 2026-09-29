import { setTimeout as delay } from 'node:timers/promises';

import { AISDKError, APICallError, RetryError, jsonSchema, streamText, tool } from 'ai';
import type { FinishReason, ToolSet } from 'ai';

import { computeCostUsd } from './cost.js';
import type { ModelPricing } from './cost.js';
import { ProviderError, providerErrorFromStatus } from './errors.js';
import type { ProviderErrorKind } from './errors.js';
import { toModelMessages } from './messages.js';
import type { Message } from './messages.js';
import { providerRegistry } from './registry.js';
import type { ProviderCredentialInput } from './types.js';

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema of the tool input. */
  inputSchema: Record<string, unknown>;
}

export type StopReason = 'end' | 'max-tokens' | 'tool-calls' | 'content-filter' | 'error' | 'other';

export type LlmEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; id: string; name: string; input: unknown }
  | {
      type: 'usage';
      inputTokens: number | null;
      outputTokens: number | null;
      cacheReadTokens: number | null;
      cacheWriteTokens: number | null;
      /** `null` when the request carried no pricing. */
      costUsd: number | null;
    }
  | { type: 'stop'; reason: StopReason };

export interface ChatRequest {
  model: string;
  system: string;
  messages: Message[];
  /** Tools the model may call. They are never executed here; the caller runs them. */
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Enables `costUsd` in the `usage` event. */
  pricing?: ModelPricing;
  /** Limit of one attempt; defaults to the client's `timeoutMs`. */
  timeoutMs?: number;
}

/** The only way agents talk to models (docs/architecture.md, section 9). */
export interface LlmClient {
  chat(req: ChatRequest): AsyncIterable<LlmEvent>;
}

export interface LlmClientOptions {
  /** Retries after a rate limit, a server error or a network failure. Defaults to 3. */
  maxRetries?: number;
  /** Wait before the first retry, doubled for each next one. Defaults to 1 s. */
  initialDelayMs?: number;
  maxDelayMs?: number;
  /** Limit of one attempt. Defaults to `DEFAULT_CHAT_TIMEOUT_MS`. */
  timeoutMs?: number;
  /** Replaces the wait between retries; for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export const DEFAULT_CHAT_TIMEOUT_MS = 5 * 60 * 1000;

const RETRYABLE: readonly ProviderErrorKind[] = ['rate_limited', 'unavailable', 'network'];

const STOP_REASONS: Record<FinishReason, StopReason> = {
  stop: 'end',
  length: 'max-tokens',
  'tool-calls': 'tool-calls',
  'content-filter': 'content-filter',
  error: 'error',
  other: 'other',
};

/**
 * Reduces SDK errors to `ProviderError`, whose messages carry no request or response data.
 * Anything that is not an AI SDK error (a cancellation, a bug in this package) is rethrown
 * unchanged, so it is not disguised as a misbehaving provider.
 */
export function toProviderError(error: unknown): unknown {
  if (error instanceof ProviderError) return error;
  if (RetryError.isInstance(error)) return toProviderError(error.lastError);
  if (APICallError.isInstance(error)) {
    return error.statusCode === undefined
      ? new ProviderError('network')
      : providerErrorFromStatus(error.statusCode);
  }
  if (AISDKError.isInstance(error)) return new ProviderError('bad_response');
  return error;
}

function toToolSet(tools: ToolDefinition[]): ToolSet {
  const set: ToolSet = {};
  for (const definition of tools) {
    // No `execute`: the SDK returns the call and stops; the agent loop runs the tool.
    set[definition.name] = tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.inputSchema as Parameters<typeof jsonSchema>[0]),
    });
  }
  return set;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  delay(ms, undefined, signal ? { signal } : {});

export function createLlmClient(
  credential: ProviderCredentialInput,
  options: LlmClientOptions = {},
): LlmClient {
  const { adapter } = providerRegistry[credential.type];
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const sleep = options.sleep ?? defaultSleep;

  async function* attempt(req: ChatRequest, signal: AbortSignal): AsyncGenerator<LlmEvent> {
    const result = streamText({
      model: adapter.createModel(credential, req.model),
      instructions: req.system,
      messages: toModelMessages(req.messages),
      ...(req.tools && req.tools.length > 0 ? { tools: toToolSet(req.tools) } : {}),
      ...(req.maxTokens === undefined ? {} : { maxOutputTokens: req.maxTokens }),
      ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
      // Retries are done below, where it is known whether anything was already emitted.
      maxRetries: 0,
      abortSignal: signal,
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          yield { type: 'text-delta', text: part.text };
          break;
        case 'tool-call':
          yield { type: 'tool-call', id: part.toolCallId, name: part.toolName, input: part.input };
          break;
        case 'error':
          throw part.error;
        case 'abort':
          // The SDK ends the stream quietly on abort; callers must see it as a failure.
          signal.throwIfAborted();
          throw new DOMException('The call was aborted', 'AbortError');
        case 'finish': {
          const inputTokens = part.totalUsage.inputTokens ?? null;
          const outputTokens = part.totalUsage.outputTokens ?? null;
          yield {
            type: 'usage',
            inputTokens,
            outputTokens,
            cacheReadTokens: part.totalUsage.inputTokenDetails.cacheReadTokens ?? null,
            cacheWriteTokens: part.totalUsage.inputTokenDetails.cacheWriteTokens ?? null,
            costUsd: req.pricing
              ? computeCostUsd({ inputTokens, outputTokens }, req.pricing)
              : null,
          };
          yield { type: 'stop', reason: STOP_REASONS[part.finishReason] };
          break;
        }
        default:
          break;
      }
    }
  }

  return {
    async *chat(req) {
      for (let retry = 0; ; retry++) {
        const timeout = AbortSignal.timeout(
          req.timeoutMs ?? options.timeoutMs ?? DEFAULT_CHAT_TIMEOUT_MS,
        );
        const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
        let emitted = false;
        try {
          for await (const event of attempt(req, signal)) {
            emitted = true;
            yield event;
          }
          return;
        } catch (error) {
          if (req.signal?.aborted) throw error;
          const failure = timeout.aborted ? new ProviderError('timeout') : toProviderError(error);
          // A retry after output was emitted would repeat it; only clean failures are retried.
          const retryable =
            failure instanceof ProviderError && RETRYABLE.includes(failure.kind) && !emitted;
          if (!retryable || retry >= maxRetries) throw failure;
          await sleep(Math.min(initialDelayMs * 2 ** retry, maxDelayMs), req.signal);
        }
      }
    },
  };
}
