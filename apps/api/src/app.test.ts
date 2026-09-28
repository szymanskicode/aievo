import { closeTestDb, getTestDb } from '@aievo/db/testing';
import { healthResponseSchema } from '@aievo/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { createLogger } from './logger.js';

// Health and error handling never query the database, but the app requires a connection.
const db = getTestDb();

afterAll(closeTestDb);

describe('GET /api/health', () => {
  it('returns a healthy status', async () => {
    const response = await request(createApp({ db })).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(healthResponseSchema.safeParse(response.body).success).toBe(true);
  });
});

describe('unknown routes', () => {
  it('answer 404 in the shared error format', async () => {
    const response = await request(createApp({ db })).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: { code: 'not_found', message: expect.stringContaining('/api/does-not-exist') },
    });
  });

  it('do not echo the query string back to the caller', async () => {
    const response = await request(createApp({ db })).get('/api/does-not-exist?token=super-secret');

    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain('super-secret');
  });
});

describe('malformed request bodies', () => {
  it('are rejected with 400, not reported as a server error', async () => {
    const response = await request(createApp({ db }))
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'bad_request', message: 'Malformed request' },
    });
  });

  it('do not leak the rejected body in the response', async () => {
    const response = await request(createApp({ db }))
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"apiKey": "sk-secret-value"');

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain('sk-secret-value');
  });
});

describe('request logging', () => {
  it('redacts credential headers', async () => {
    const written: string[] = [];
    const logger = createLogger('info', {
      write: (chunk: string) => {
        written.push(chunk);
      },
    });

    await request(createApp({ db, logger }))
      .get('/api/health')
      .set('Authorization', 'Bearer sk-ant-secret-token')
      .set('Cookie', 'session=secret-session')
      .set('X-Api-Key', 'secret-api-key');

    const logs = written.join('');

    expect(logs).toContain('/api/health');
    expect(logs).not.toContain('sk-ant-secret-token');
    expect(logs).not.toContain('secret-session');
    expect(logs).not.toContain('secret-api-key');
    expect(logs).toContain('[redacted]');
  });
});
