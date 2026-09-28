import { APICallError, RetryError, streamText } from 'ai';
import type { FinishReason, ModelMessage } from 'ai';

import { ProviderError, providerErrorFromStatus } from './errors.js';
import { providerRegistry } from './registry.js';
import type { ProviderCredentialInput } from './types.js';

/**
 * Provider-neutral message. Stage 1 needs plain text only; tool calls and results
 * are added together with the agent loop (stage 2).
 */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

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
    }
  | { type: 'stop'; reason: StopReason };

export interface ChatRequest {
  model: string;
  system: string;
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/** The only way agents talk to models (docs/architecture.md, section 9). */
export interface LlmClient {
  chat(req: ChatRequest): AsyncIterable<LlmEvent>;
}

const STOP_REASONS: Record<FinishReason, StopReason> = {
  stop: 'end',
  length: 'max-tokens',
  'tool-calls': 'tool-calls',
  'content-filter': 'content-filter',
  error: 'error',
  other: 'other',
};

/** Reduces SDK errors to `ProviderError`, whose messages carry no request or response data. */
function toProviderError(error: unknown): unknown {
  if (error instanceof ProviderError) return error;
  if (RetryError.isInstance(error)) return toProviderError(error.lastError);
  if (APICallError.isInstance(error)) {
    return error.statusCode === undefined
      ? new ProviderError('network')
      : providerErrorFromStatus(error.statusCode);
  }
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return error;
  }
  return new ProviderError('bad_response');
}

export function createLlmClient(credential: ProviderCredentialInput): LlmClient {
  const { adapter } = providerRegistry[credential.type];

  return {
    async *chat(req) {
      if (req.tools && req.tools.length > 0) {
        throw new Error('Tool calling is not supported yet (planned for stage 2)');
      }

      const result = streamText({
        model: adapter.createModel(credential, req.model),
        instructions: req.system,
        messages: req.messages satisfies ModelMessage[],
        ...(req.maxTokens === undefined ? {} : { maxOutputTokens: req.maxTokens }),
        ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
        ...(req.signal ? { abortSignal: req.signal } : {}),
      });

      try {
        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta':
              yield { type: 'text-delta', text: part.text };
              break;
            case 'error':
              throw part.error;
            case 'finish':
              yield {
                type: 'usage',
                inputTokens: part.totalUsage.inputTokens ?? null,
                outputTokens: part.totalUsage.outputTokens ?? null,
                cacheReadTokens: part.totalUsage.inputTokenDetails.cacheReadTokens ?? null,
                cacheWriteTokens: part.totalUsage.inputTokenDetails.cacheWriteTokens ?? null,
              };
              yield { type: 'stop', reason: STOP_REASONS[part.finishReason] };
              break;
            default:
              break;
          }
        }
      } catch (error) {
        throw toProviderError(error);
      }
    },
  };
}
