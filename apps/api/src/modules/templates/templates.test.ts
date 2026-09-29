import { closeTestDb } from '@aievo/db/testing';
import { templateSchema } from '@aievo/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { setupTestApp } from '../../test/app.js';
import type { TestContext } from '../../test/app.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await setupTestApp();
});

afterAll(closeTestDb);

describe('GET /api/templates', () => {
  it('lists the built-in templates with their manifests', async () => {
    const response = await request(ctx.app).get('/api/templates');

    expect(response.status).toBe(200);
    const templates = response.body.map((entry: unknown) => templateSchema.parse(entry));
    expect(templates.map((template: { id: string }) => template.id)).toEqual([
      'empty',
      'react-vite-ts',
    ]);
    expect(templates[1].manifest).toMatchObject({
      name: 'React + Vite + TypeScript + Vitest',
      preview: { port: 5173, readyPath: '/' },
      testPolicy: { framework: 'vitest' },
    });
  });
});
