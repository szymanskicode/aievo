import { SEED_PROJECT_ID, seed } from '@aievo/db';
import { closeTestDb, getTestDb, resetDb } from '@aievo/db/testing';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';

const db = getTestDb();

beforeEach(async () => {
  await resetDb(db);
});

afterAll(closeTestDb);

describe('workspace resolution', () => {
  it('uses the seeded default workspace when none is configured', async () => {
    await seed(db);

    const response = await request(createApp({ db })).get('/api/projects');

    expect(response.status).toBe(200);
    expect(response.body.map((p: { id: string }) => p.id)).toEqual([SEED_PROJECT_ID]);
  });

  it('passes resolver failures to the error handler', async () => {
    const app = createApp({
      db,
      resolveWorkspace: () => Promise.reject(new Error('boom')),
    });

    const response = await request(app).get('/api/projects');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'internal_error', message: 'Unexpected server error' },
    });
  });

  it('is not needed by public routes', async () => {
    const app = createApp({
      db,
      resolveWorkspace: () => Promise.reject(new Error('boom')),
    });

    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/openapi.json')).status).toBe(200);
  });
});
