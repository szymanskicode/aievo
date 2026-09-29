import { APICallError, InvalidResponseDataError, RetryError } from 'ai';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { createLlmClient, toProviderError } from './client.js';
import type { LlmEvent } from './client.js';
import { ProviderError } from './errors.js';
import { useMockProviders } from './test/msw.js';
import type { ProviderCredentialInput } from './types.js';

const server = useMockProviders();

const ollama: ProviderCredentialInput = {
  type: 'openai-compatible',
  apiKey: null,
  baseUrl: 'http://127.0.0.1:11434/v1',
};
const url = 'http://127.0.0.1:11434/v1/chat/completions';

function chunk(delta: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  const body = {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'llama3.2',
    choices: [{ index: 0, delta, finish_reason: null }],
    ...extra,
  };
  return `data: ${JSON.stringify(body)}\n\n`;
}

function sse(events: string[]): HttpResponse<string> {
  return new HttpResponse(events.join('') + 'data: [DONE]\n\n', {
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function collect(events: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> {
  const result: LlmEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

const request = {
  model: 'llama3.2',
  system: 'Be brief.',
  messages: [{ role: 'user' as const, content: 'Hi' }],
};

describe('createLlmClient', () => {
  it('streams text, usage and the stop reason', async () => {
    let sent: Record<string, unknown> = {};
    server.use(
      http.post(url, async ({ request: req }) => {
        sent = (await req.json()) as Record<string, unknown>;
        return sse([
          chunk({ role: 'assistant', content: 'Hel' }),
          chunk({ content: 'lo' }),
          `data: ${JSON.stringify({
            id: 'chatcmpl-1',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'llama3.2',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 },
          })}\n\n`,
        ]);
      }),
    );

    const events = await collect(
      createLlmClient(ollama).chat({ ...request, maxTokens: 16, temperature: 0 }),
    );

    expect(sent).toMatchObject({
      model: 'llama3.2',
      max_tokens: 16,
      temperature: 0,
      messages: [
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'Hi' },
      ],
    });
    expect(events).toEqual([
      { type: 'text-delta', text: 'Hel' },
      { type: 'text-delta', text: 'lo' },
      {
        type: 'usage',
        inputTokens: 7,
        outputTokens: 2,
        // The SDK reports cache reads as 0 for this provider and leaves writes unknown.
        cacheReadTokens: 0,
        cacheWriteTokens: null,
      },
      { type: 'stop', reason: 'end' },
    ]);
  });

  it('turns provider failures into ProviderError', async () => {
    server.use(http.post(url, () => HttpResponse.json({ error: 'nope' }, { status: 401 })));

    await expect(collect(createLlmClient(ollama).chat(request))).rejects.toMatchObject({
      name: 'ProviderError',
      kind: 'unauthorized',
    });
    await expect(collect(createLlmClient(ollama).chat(request))).rejects.toBeInstanceOf(
      ProviderError,
    );
  });

  it('refuses tools until the agent loop exists', async () => {
    const tools = [{ name: 'read_file', description: 'Read a file', inputSchema: {} }];
    await expect(collect(createLlmClient(ollama).chat({ ...request, tools }))).rejects.toThrow(
      /stage 2/,
    );
  });
});

describe('toProviderError', () => {
  it('keeps a ProviderError', () => {
    const error = new ProviderError('timeout');
    expect(toProviderError(error)).toBe(error);
  });

  it('maps API call errors by status, or to a network error without one', () => {
    const call = { url: 'https://api.example.test', requestBodyValues: {} };
    const unauthorized = new APICallError({ ...call, message: 'x', statusCode: 401 });
    const offline = new APICallError({ ...call, message: 'x' });

    expect(toProviderError(unauthorized)).toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(toProviderError(offline)).toMatchObject({ kind: 'network' });
    expect(
      toProviderError(
        new RetryError({ message: 'x', reason: 'maxRetriesExceeded', errors: [unauthorized] }),
      ),
    ).toMatchObject({ kind: 'unauthorized' });
  });

  it('reports other AI SDK errors as a bad response without their details', () => {
    const error = toProviderError(new InvalidResponseDataError({ data: { secret: 'body' } }));

    expect(error).toMatchObject({ kind: 'bad_response' });
    expect((error as Error).message).not.toContain('secret');
  });

  it('rethrows errors that do not come from the AI SDK unchanged', () => {
    const bug = new TypeError('cannot read properties of undefined');
    const abort = new DOMException('aborted', 'AbortError');

    expect(toProviderError(bug)).toBe(bug);
    expect(toProviderError(abort)).toBe(abort);
  });
});
