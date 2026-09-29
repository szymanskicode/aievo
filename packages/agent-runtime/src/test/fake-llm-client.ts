import { computeCostUsd } from '@aievo/llm';
import type { ChatRequest, LlmClient, LlmEvent, StopReason } from '@aievo/llm';

export interface FakeToolCall {
  id?: string;
  name: string;
  input: unknown;
}

/** One scripted model response. */
export interface FakeResponse {
  text?: string;
  toolCalls?: FakeToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
  stopReason?: StopReason;
  /** Thrown instead of answering (e.g. a `ProviderError`). */
  error?: unknown;
  /** Hangs until the request is aborted, like a slow provider. */
  hang?: boolean;
}

const DEFAULT_USAGE = { inputTokens: 100, outputTokens: 20 };

/**
 * Replays a scripted conversation. Every request is recorded (with a copy of its messages,
 * which the loop keeps appending to); running out of script fails the test loudly.
 */
export class FakeLlmClient implements LlmClient {
  readonly requests: ChatRequest[] = [];
  private next = 0;
  private callIds = 0;

  constructor(private readonly script: FakeResponse[]) {}

  get remaining(): number {
    return this.script.length - this.next;
  }

  async *chat(req: ChatRequest): AsyncIterable<LlmEvent> {
    this.requests.push({ ...req, messages: structuredClone(req.messages) });
    const response = this.script[this.next];
    this.next += 1;
    if (!response) throw new Error(`FakeLlmClient: no scripted response #${this.next}`);

    if (response.hang) {
      await new Promise<never>((_, reject) => {
        const abort = () => reject(req.signal?.reason ?? new Error('aborted'));
        if (req.signal?.aborted) abort();
        req.signal?.addEventListener('abort', abort, { once: true });
      });
    }
    if (response.error !== undefined) throw response.error;

    if (response.text) yield { type: 'text-delta', text: response.text };
    for (const call of response.toolCalls ?? []) {
      this.callIds += 1;
      yield {
        type: 'tool-call',
        id: call.id ?? `call_${this.callIds}`,
        name: call.name,
        input: call.input,
      };
    }
    const usage = response.usage ?? DEFAULT_USAGE;
    yield {
      type: 'usage',
      ...usage,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      costUsd: req.pricing ? computeCostUsd(usage, req.pricing) : null,
    };
    yield {
      type: 'stop',
      reason: response.stopReason ?? (response.toolCalls?.length ? 'tool-calls' : 'end'),
    };
  }
}
