import { HttpResponse, delay, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { createLlmClient } from './client.js';
import type { ChatRequest, LlmEvent } from './client.js';
import type { Message } from './messages.js';
import { useMockProviders } from './test/msw.js';
import type { ProviderCredentialInput } from './types.js';

const server = useMockProviders();

const ollama: ProviderCredentialInput = {
  type: 'openai-compatible',
  apiKey: null,
  baseUrl: 'http://127.0.0.1:11434/v1',
};
const ollamaUrl = 'http://127.0.0.1:11434/v1/chat/completions';

const anthropic: ProviderCredentialInput = {
  type: 'anthropic',
  apiKey: 'sk-ant-test',
  baseUrl: 'https://anthropic.test/v1',
};
const anthropicUrl = 'https://anthropic.test/v1/messages';

const readFileTool = {
  name: 'read_file',
  description: 'Read a file',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
    additionalProperties: false,
  },
};

async function collect(events: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> {
  const result: LlmEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

function openAiChunk(
  delta: Record<string, unknown>,
  finishReason: string | null = null,
  usage?: Record<string, number>,
): string {
  const body = {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'llama3.2',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...(usage ? { usage } : {}),
  };
  return `data: ${JSON.stringify(body)}\n\n`;
}

function sse(events: string[], done = true): HttpResponse<string> {
  return new HttpResponse(events.join('') + (done ? 'data: [DONE]\n\n' : ''), {
    headers: { 'content-type': 'text/event-stream' },
  });
}

function textReply(text: string): HttpResponse<string> {
  return sse([
    openAiChunk({ role: 'assistant', content: text }),
    openAiChunk({}, 'stop', { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }),
  ]);
}

function anthropicEvent(type: string, data: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

const conversation: Message[] = [
  { role: 'user', content: 'Read the README' },
  {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Reading it.' },
      { type: 'tool-call', id: 'call_1', name: 'read_file', input: { path: 'README.md' } },
    ],
  },
  {
    role: 'tool',
    content: [
      { type: 'tool-result', callId: 'call_1', name: 'read_file', output: '# Hi', isError: false },
    ],
  },
];

describe('LlmClient with tools', () => {
  it('sends tools and tool messages and streams tool calls (OpenAI format)', async () => {
    let sent: Record<string, unknown> = {};
    server.use(
      http.post(ollamaUrl, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return sse([
          openAiChunk({
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'call_2',
                type: 'function',
                function: { name: 'read_file', arguments: '{"path":' },
              },
            ],
          }),
          openAiChunk({ tool_calls: [{ index: 0, function: { arguments: '"src/a.ts"}' } }] }),
          openAiChunk({}, 'tool_calls', {
            prompt_tokens: 1000,
            completion_tokens: 200,
            total_tokens: 1200,
          }),
        ]);
      }),
    );

    const events = await collect(
      createLlmClient(ollama).chat({
        model: 'llama3.2',
        system: 'You are an agent.',
        messages: conversation,
        tools: [readFileTool],
        pricing: { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
      }),
    );

    expect(sent).toMatchObject({
      tools: [
        {
          type: 'function',
          function: {
            name: 'read_file',
            description: 'Read a file',
            parameters: readFileTool.inputSchema,
          },
        },
      ],
      messages: [
        { role: 'system', content: 'You are an agent.' },
        { role: 'user', content: 'Read the README' },
        {
          role: 'assistant',
          content: 'Reading it.',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'read_file', arguments: '{"path":"README.md"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: '# Hi' },
      ],
    });
    expect(events).toEqual([
      { type: 'tool-call', id: 'call_2', name: 'read_file', input: { path: 'src/a.ts' } },
      {
        type: 'usage',
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 0,
        cacheWriteTokens: null,
        // 1000 × 3 + 200 × 15 per million tokens.
        costUsd: 0.006,
      },
      { type: 'stop', reason: 'tool-calls' },
    ]);
  });

  it('sends failed tool results as errors', async () => {
    let sent: { messages?: unknown[] } = {};
    server.use(
      http.post(ollamaUrl, async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return textReply('ok');
      }),
    );
    const failed: Message[] = [
      conversation[0]!,
      conversation[1]!,
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            callId: 'call_1',
            name: 'read_file',
            output: 'Not found',
            isError: true,
          },
        ],
      },
    ];

    await collect(
      createLlmClient(ollama).chat({
        model: 'm',
        system: 's',
        messages: failed,
        tools: [readFileTool],
      }),
    );

    expect(sent.messages?.[3]).toMatchObject({ role: 'tool', content: 'Not found' });
  });

  it('streams text, tool calls and cached usage from Anthropic', async () => {
    let sent: Record<string, unknown> = {};
    server.use(
      http.post(anthropicUrl, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(
          [
            anthropicEvent('message_start', {
              message: {
                id: 'msg_1',
                type: 'message',
                role: 'assistant',
                model: 'claude-test',
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: {
                  input_tokens: 100,
                  output_tokens: 1,
                  cache_read_input_tokens: 800,
                  cache_creation_input_tokens: 100,
                },
              },
            }),
            anthropicEvent('content_block_start', {
              index: 0,
              content_block: { type: 'text', text: '' },
            }),
            anthropicEvent('content_block_delta', {
              index: 0,
              delta: { type: 'text_delta', text: 'Reading.' },
            }),
            anthropicEvent('content_block_stop', { index: 0 }),
            anthropicEvent('content_block_start', {
              index: 1,
              content_block: { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: {} },
            }),
            anthropicEvent('content_block_delta', {
              index: 1,
              delta: { type: 'input_json_delta', partial_json: '{"path":' },
            }),
            anthropicEvent('content_block_delta', {
              index: 1,
              delta: { type: 'input_json_delta', partial_json: '"README.md"}' },
            }),
            anthropicEvent('content_block_stop', { index: 1 }),
            anthropicEvent('message_delta', {
              delta: { stop_reason: 'tool_use', stop_sequence: null },
              usage: { output_tokens: 50 },
            }),
            anthropicEvent('message_stop', {}),
          ].join(''),
          { headers: { 'content-type': 'text/event-stream' } },
        );
      }),
    );

    const events = await collect(
      createLlmClient(anthropic).chat({
        model: 'claude-test',
        system: 'You are an agent.',
        messages: conversation,
        tools: [readFileTool],
        maxTokens: 1024,
        pricing: { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
      }),
    );

    expect(sent).toMatchObject({
      model: 'claude-test',
      max_tokens: 1024,
      tools: [
        { name: 'read_file', description: 'Read a file', input_schema: readFileTool.inputSchema },
      ],
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Read the README' }] },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Reading it.' },
            { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'README.md' } },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '# Hi' }],
        },
      ],
    });
    expect(events).toEqual([
      { type: 'text-delta', text: 'Reading.' },
      { type: 'tool-call', id: 'toolu_1', name: 'read_file', input: { path: 'README.md' } },
      {
        type: 'usage',
        // Input includes the cache reads and writes.
        inputTokens: 1000,
        outputTokens: 50,
        cacheReadTokens: 800,
        cacheWriteTokens: 100,
        // 1000 × 3 + 50 × 15 per million tokens; cache tokens at the full input price.
        costUsd: 0.00375,
      },
      { type: 'stop', reason: 'tool-calls' },
    ]);
  });
});

describe('LlmClient retries and timeouts', () => {
  const request: ChatRequest = {
    model: 'llama3.2',
    system: 's',
    messages: [{ role: 'user', content: 'Hi' }],
  };

  function failingThen(statuses: number[]) {
    let calls = 0;
    server.use(
      http.post(ollamaUrl, () => {
        const status = statuses[calls++];
        return status === undefined ? textReply('done') : HttpResponse.json({}, { status });
      }),
    );
    return () => calls;
  }

  it('retries rate limits and server errors with exponential delays', async () => {
    const calls = failingThen([429, 429, 503]);
    const sleep = vi.fn((_ms: number) => Promise.resolve());

    const events = await collect(createLlmClient(ollama, { sleep }).chat(request));

    expect(calls()).toBe(4);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000]);
    expect(events).toContainEqual({ type: 'text-delta', text: 'done' });
  });

  it('caps the delay between retries', async () => {
    failingThen([500, 500, 500]);
    const sleep = vi.fn((_ms: number) => Promise.resolve());

    await collect(
      createLlmClient(ollama, { sleep, initialDelayMs: 500, maxDelayMs: 800 }).chat(request),
    );

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 800, 800]);
  });

  it('gives up after the last retry', async () => {
    const calls = failingThen([429, 429, 429]);
    const sleep = vi.fn((_ms: number) => Promise.resolve());

    await expect(
      collect(createLlmClient(ollama, { sleep, maxRetries: 2 }).chat(request)),
    ).rejects.toMatchObject({ name: 'ProviderError', kind: 'rate_limited' });
    expect(calls()).toBe(3);
  });

  it('does not retry client errors', async () => {
    const calls = failingThen([401]);
    const sleep = vi.fn((_ms: number) => Promise.resolve());

    await expect(collect(createLlmClient(ollama, { sleep }).chat(request))).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    expect(calls()).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry once output was emitted', async () => {
    let calls = 0;
    server.use(
      http.post(ollamaUrl, () => {
        calls++;
        // The stream starts, then breaks off with an error chunk.
        return sse(
          [
            openAiChunk({ role: 'assistant', content: 'Hel' }),
            `data: ${JSON.stringify({ error: { message: 'overloaded', type: 'server_error' } })}\n\n`,
          ],
          false,
        );
      }),
    );
    const sleep = vi.fn((_ms: number) => Promise.resolve());
    const events: LlmEvent[] = [];

    await expect(
      (async () => {
        for await (const event of createLlmClient(ollama, { sleep }).chat(request)) {
          events.push(event);
        }
      })(),
    ).rejects.toMatchObject({ name: 'ProviderError' });
    expect(events).toEqual([{ type: 'text-delta', text: 'Hel' }]);
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('fails with a timeout when an attempt takes too long', async () => {
    server.use(
      http.post(ollamaUrl, async () => {
        await delay('infinite');
        return textReply('never');
      }),
    );

    await expect(
      collect(createLlmClient(ollama, { maxRetries: 0 }).chat({ ...request, timeoutMs: 50 })),
    ).rejects.toMatchObject({ name: 'ProviderError', kind: 'timeout' });
  });

  it('rethrows a cancellation unchanged', async () => {
    server.use(
      http.post(ollamaUrl, async () => {
        await delay('infinite');
        return textReply('never');
      }),
    );
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    const error = await collect(
      createLlmClient(ollama).chat({ ...request, signal: controller.signal }),
    ).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ name: 'AbortError' });
  });
});
