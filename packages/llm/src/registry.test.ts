import { randomUUID } from 'node:crypto';

import { providerTypes } from '@aievo/shared';
import { HttpResponse, delay, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { ProviderError } from './errors.js';
import { listModels, providerRegistry } from './registry.js';
import { useMockProviders } from './test/msw.js';
import type { ProviderCredentialInput } from './types.js';

const server = useMockProviders();

// Generated per run: a fake key that only exists inside this test process.
const fakeKey = `sk-test-${randomUUID()}`;

const anthropic: ProviderCredentialInput = { type: 'anthropic', apiKey: fakeKey, baseUrl: null };
const openai: ProviderCredentialInput = { type: 'openai', apiKey: fakeKey, baseUrl: null };
const ollama: ProviderCredentialInput = {
  type: 'openai-compatible',
  apiKey: null,
  baseUrl: 'http://127.0.0.1:11434/v1/',
};

async function providerError(promise: Promise<unknown>): Promise<ProviderError> {
  const error = await promise.then(
    () => expect.unreachable('expected a ProviderError'),
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ProviderError);
  return error as ProviderError;
}

describe('providerRegistry', () => {
  it('has an adapter for every provider type', () => {
    for (const type of providerTypes) {
      expect(providerRegistry[type].adapter.type).toBe(type);
      expect(providerRegistry[type].type).toBe(type);
    }
  });

  it('builds AI SDK models without network calls', () => {
    const credentials = [anthropic, openai, ollama];
    for (const credential of credentials) {
      const model = providerRegistry[credential.type].adapter.createModel(credential, 'm');
      expect(typeof model === 'string' ? model : model.modelId, credential.type).toBe('m');
    }
  });
});

describe('listModels: anthropic', () => {
  it('authenticates with the key and follows pagination', async () => {
    const seen: { key: string | null; version: string | null; after: string | null }[] = [];
    server.use(
      http.get('https://api.anthropic.com/v1/models', ({ request }) => {
        const url = new URL(request.url);
        seen.push({
          key: request.headers.get('x-api-key'),
          version: request.headers.get('anthropic-version'),
          after: url.searchParams.get('after_id'),
        });
        return url.searchParams.get('after_id')
          ? HttpResponse.json({
              data: [{ id: 'claude-b', display_name: 'Claude B', type: 'model' }],
              has_more: false,
              last_id: 'claude-b',
            })
          : HttpResponse.json({
              data: [
                {
                  id: 'claude-a',
                  display_name: 'Claude A',
                  max_input_tokens: 200000,
                  max_tokens: 64000,
                },
              ],
              has_more: true,
              last_id: 'claude-a',
            });
      }),
    );

    const models = await listModels(anthropic);

    expect(seen).toEqual([
      { key: fakeKey, version: '2023-06-01', after: null },
      { key: fakeKey, version: '2023-06-01', after: 'claude-a' },
    ]);
    expect(models).toEqual([
      {
        modelId: 'claude-a',
        displayName: 'Claude A',
        capabilities: {
          tools: true,
          vision: true,
          structuredOutput: true,
          promptCaching: true,
          reasoning: false,
          contextWindow: 200000,
          maxOutput: 64000,
        },
        enabled: true,
      },
      expect.objectContaining({
        modelId: 'claude-b',
        capabilities: expect.objectContaining({ contextWindow: null, maxOutput: null }),
      }),
    ]);
  });

  it('uses a custom base URL', async () => {
    server.use(
      http.get('https://proxy.example.test/anthropic/models', () =>
        HttpResponse.json({ data: [{ id: 'claude-x' }], has_more: false }),
      ),
    );

    const models = await listModels({
      ...anthropic,
      baseUrl: 'https://proxy.example.test/anthropic',
    });

    expect(models.map((m) => [m.modelId, m.displayName])).toEqual([['claude-x', 'claude-x']]);
  });

  it('reports a rejected key without echoing it', async () => {
    server.use(
      http.get('https://api.anthropic.com/v1/models', () =>
        HttpResponse.json(
          { type: 'error', error: { type: 'authentication_error', message: `bad key ${fakeKey}` } },
          { status: 401 },
        ),
      ),
    );

    const error = await providerError(listModels(anthropic));

    expect(error.kind).toBe('unauthorized');
    expect(error.status).toBe(401);
    expect(JSON.stringify({ message: error.message, stack: error.stack })).not.toContain(fakeKey);
  });

  it('fails without a request when the key is missing', async () => {
    const error = await providerError(listModels({ ...anthropic, apiKey: null }));
    expect(error.kind).toBe('unauthorized');
  });
});

describe('listModels: openai', () => {
  it('sends a bearer token and disables non-chat models', async () => {
    let authorization: string | null = null;
    server.use(
      http.get('https://api.openai.com/v1/models', ({ request }) => {
        authorization = request.headers.get('authorization');
        return HttpResponse.json({
          object: 'list',
          data: [
            { id: 'gpt-b', object: 'model', owned_by: 'openai' },
            { id: 'text-embedding-3-small', object: 'model', owned_by: 'openai' },
            { id: 'gpt-a', object: 'model', owned_by: 'openai' },
            { id: 'gpt-a', object: 'model', owned_by: 'openai' },
          ],
        });
      }),
    );

    const models = await listModels(openai);

    expect(authorization).toBe(`Bearer ${fakeKey}`);
    expect(models.map((m) => [m.modelId, m.enabled])).toEqual([
      ['gpt-a', true],
      ['gpt-b', true],
      ['text-embedding-3-small', false],
    ]);
    expect(models[0]?.capabilities).toEqual({
      tools: false,
      vision: false,
      structuredOutput: false,
      promptCaching: false,
      reasoning: false,
      contextWindow: null,
      maxOutput: null,
    });
  });
});

describe('listModels: openai-compatible', () => {
  it('lists Ollama models without an Authorization header', async () => {
    let authorization: string | null = 'not checked';
    server.use(
      http.get('http://127.0.0.1:11434/v1/models', ({ request }) => {
        authorization = request.headers.get('authorization');
        return HttpResponse.json({
          object: 'list',
          data: [{ id: 'llama3.2:latest', object: 'model', owned_by: 'library' }],
        });
      }),
    );

    const models = await listModels(ollama);

    expect(authorization).toBeNull();
    expect(models.map((m) => m.modelId)).toEqual(['llama3.2:latest']);
  });

  it('uses the extra metadata some servers return', async () => {
    server.use(
      http.get('https://router.example.test/api/v1/models', () =>
        HttpResponse.json({
          data: [
            {
              id: 'vendor/model',
              name: 'Vendor: Model',
              context_length: 131072,
              architecture: { input_modalities: ['text', 'image'] },
              supported_parameters: ['tools', 'structured_outputs', 'reasoning'],
              top_provider: { max_completion_tokens: 8192 },
            },
            { id: 'vendor/plain', architecture: 'unexpected', top_provider: null },
          ],
        }),
      ),
    );

    const models = await listModels({
      type: 'openai-compatible',
      apiKey: fakeKey,
      baseUrl: 'https://router.example.test/api/v1',
    });

    expect(models[0]).toEqual({
      modelId: 'vendor/model',
      displayName: 'Vendor: Model',
      capabilities: {
        tools: true,
        vision: true,
        structuredOutput: true,
        promptCaching: false,
        reasoning: true,
        contextWindow: 131072,
        maxOutput: 8192,
      },
      enabled: true,
    });
    expect(models[1]?.capabilities.tools).toBe(false);
  });
});

describe('listModels: failures', () => {
  const url = 'http://127.0.0.1:11434/v1/models';

  it.each([
    [403, 'forbidden'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [400, 'bad_response'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    server.use(http.get(url, () => HttpResponse.json({ secret: 'body' }, { status })));

    const error = await providerError(listModels(ollama));

    expect(error.kind).toBe(kind);
    expect(error.message).not.toContain('secret');
  });

  it('does not follow redirects, so the key never reaches another host', async () => {
    let redirectedKey: string | null = null;
    server.use(
      http.get(
        'https://api.anthropic.com/v1/models',
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: { location: 'https://collector.example.test/models' },
          }),
      ),
      http.get('https://collector.example.test/models', ({ request }) => {
        redirectedKey = request.headers.get('x-api-key');
        return HttpResponse.json({ data: [], has_more: false });
      }),
    );

    const error = await providerError(listModels(anthropic));

    expect(error.kind).toBe('bad_response');
    expect(error.status).toBe(302);
    expect(redirectedKey).toBeNull();
  });

  it('rejects a body that is not JSON or not a model list', async () => {
    server.use(http.get(url, () => HttpResponse.text('<html>proxy error</html>')));
    expect((await providerError(listModels(ollama))).kind).toBe('bad_response');

    server.use(http.get(url, () => HttpResponse.json({ models: [] })));
    expect((await providerError(listModels(ollama))).kind).toBe('bad_response');
  });

  it('times out on a slow provider', async () => {
    server.use(
      http.get(url, async () => {
        await delay(1_000);
        return HttpResponse.json({ data: [] });
      }),
    );

    const error = await providerError(listModels(ollama, { timeoutMs: 50 }));
    expect(error.kind).toBe('timeout');
  });

  it('never reaches the network for a request without a mock', async () => {
    // The real api.openai.com would answer 401 (`unauthorized`); msw must stop it first.
    const error = await providerError(listModels(openai));
    expect(error.kind).toBe('network');
  });

  it('reports an unreachable provider', async () => {
    server.use(http.get(url, () => HttpResponse.error()));
    expect((await providerError(listModels(ollama))).kind).toBe('network');
  });

  it('passes a cancellation by the caller through', async () => {
    server.use(
      http.get(url, async () => {
        await delay(1_000);
        return HttpResponse.json({ data: [] });
      }),
    );
    const controller = new AbortController();
    const pending = listModels(ollama, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.not.toBeInstanceOf(ProviderError);
  });
});
