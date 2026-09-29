import { describe, expect, it } from 'vitest';

import { createApiClient } from './index.js';
import { ApiClientError, unwrap } from './errors.js';

function clientReturning(response: Response | Error) {
  return createApiClient({
    baseUrl: 'http://api.test/api',
    fetch: () => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)),
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('unwrap', () => {
  it('returns the data of a successful response', async () => {
    const client = clientReturning(json(200, { status: 'ok' }));

    await expect(unwrap(client.GET('/api/health'))).resolves.toEqual({ status: 'ok' });
  });

  it('returns undefined for 204 responses', async () => {
    const client = clientReturning(new Response(null, { status: 204 }));

    await expect(
      unwrap(client.DELETE('/api/tasks/{id}', { params: { path: { id: 'x' } } })),
    ).resolves.toBeUndefined();
  });

  it('throws the API error with status, code, message and details', async () => {
    const details = [{ path: ['body', 'title'], code: 'too_small', message: 'Too small' }];
    const client = clientReturning(
      json(400, {
        error: { code: 'validation_error', message: 'Request validation failed', details },
      }),
    );

    const error = await unwrap(client.GET('/api/projects')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 400,
      code: 'validation_error',
      message: 'Request validation failed',
      details,
    });
  });

  it('describes responses that are not in the API error format', async () => {
    const client = clientReturning(new Response('Bad gateway', { status: 502 }));

    await expect(unwrap(client.GET('/api/projects'))).rejects.toMatchObject({
      status: 502,
      code: 'unexpected_response',
    });
  });

  it('turns a failed request into a network error', async () => {
    const client = clientReturning(new TypeError('fetch failed'));

    await expect(unwrap(client.GET('/api/projects'))).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
    });
  });

  it('does not report an unreadable success response as a network error', async () => {
    const client = clientReturning(
      new Response('<html>not json</html>', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const error = await unwrap(client.GET('/api/projects')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SyntaxError);
    expect(error).not.toBeInstanceOf(ApiClientError);
  });

  it('rethrows aborted requests unchanged', async () => {
    const abort = new DOMException('The operation was aborted', 'AbortError');
    const client = clientReturning(abort);

    await expect(unwrap(client.GET('/api/projects'))).rejects.toBe(abort);
  });
});
