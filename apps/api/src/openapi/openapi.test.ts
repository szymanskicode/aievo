import { readFileSync } from 'node:fs';

import { closeTestDb, getTestDb } from '@aievo/db/testing';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { getOpenApiDocument } from '../routes.js';
import { toOpenApiPath } from './document.js';
import { OPENAPI_FILE, serializeOpenApiDocument } from './file.js';

const db = getTestDb();

afterAll(closeTestDb);

/** Every endpoint the API must serve, as `METHOD /path` in OpenAPI notation. */
const EXPECTED_OPERATIONS = [
  'GET /api/health',
  'GET /api/openapi.json',
  'GET /api/projects',
  'POST /api/projects',
  'GET /api/projects/{id}',
  'PATCH /api/projects/{id}',
  'DELETE /api/projects/{id}',
  'GET /api/projects/{id}/tasks',
  'POST /api/projects/{id}/tasks',
  'GET /api/tasks/{id}',
  'PATCH /api/tasks/{id}',
  'DELETE /api/tasks/{id}',
];

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function documentedOperations(): string[] {
  const operations: string[] = [];
  for (const [path, item] of Object.entries(getOpenApiDocument().paths ?? {})) {
    for (const method of HTTP_METHODS) {
      if (item[method]) operations.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return operations;
}

function collectRefs(value: unknown, refs: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) collectRefs(entry, refs);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      if (key === '$ref' && typeof entry === 'string') refs.push(entry);
      else collectRefs(entry, refs);
    }
  }
  return refs;
}

describe('OpenAPI document', () => {
  it('is an OpenAPI 3.1 document', () => {
    expect(getOpenApiDocument().openapi).toBe('3.1.0');
  });

  it('describes exactly the expected endpoints', () => {
    expect(documentedOperations().sort()).toEqual([...EXPECTED_OPERATIONS].sort());
  });

  it('describes only routes that the app really serves', async () => {
    const app = createApp({ db });

    for (const operation of documentedOperations()) {
      const [method, path] = operation.split(' ') as [string, string];
      // An id that does not exist: the route may answer 404 for the resource, but
      // must never fall through to the catch-all "No route matches".
      const url = path.replace(/\{\w+\}/g, '00000000-0000-4000-8000-00000000dead');
      const response = await request(app)[method.toLowerCase() as 'get'](url).send({});

      expect(response.body?.error?.message ?? '', operation).not.toMatch(/^No route matches/);
    }
  });

  it('resolves every $ref to a component', () => {
    const document = getOpenApiDocument();
    const schemas = document.components?.schemas ?? {};
    const refs = collectRefs(document);

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref).toMatch(/^#\/components\/schemas\//);
      expect(schemas, ref).toHaveProperty([ref.replace('#/components/schemas/', '')]);
    }
  });

  it('documents errors in the shared error format', () => {
    const operation = getOpenApiDocument().paths?.['/api/projects/{id}']?.get;

    expect(operation?.responses?.['404']).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
    });
  });

  it('describes responses with every field that is always present', () => {
    const schemas = getOpenApiDocument().components?.schemas ?? {};

    expect(schemas.Project).toMatchObject({
      properties: { testPolicy: { $ref: '#/components/schemas/TestPolicy' } },
    });
    expect(schemas.TestPolicy).toMatchObject({
      required: expect.arrayContaining(['framework', 'commands', 'changedLines', 'audit']),
    });
    expect(schemas.ProjectSettings).toMatchObject({ required: ['commands'] });
  });

  it('keeps fields with defaults optional in request bodies', () => {
    const schemas = getOpenApiDocument().components?.schemas ?? {};

    expect(schemas.CreateProject).toMatchObject({
      properties: { settings: { $ref: '#/components/schemas/ProjectSettingsInput' } },
    });
    expect(schemas.ProjectSettingsInput).not.toHaveProperty('required');
    expect(schemas.TestPolicyInput).not.toHaveProperty('required');
  });

  it('documents 415 for routes that take a JSON body', () => {
    const paths = getOpenApiDocument().paths ?? {};

    expect(paths['/api/projects']?.post?.responses).toHaveProperty('415');
    expect(paths['/api/tasks/{id}']?.patch?.responses).toHaveProperty('415');
    expect(paths['/api/tasks/{id}']?.get?.responses).not.toHaveProperty('415');
  });

  it('groups every task operation under the tasks tag', () => {
    const paths = getOpenApiDocument().paths ?? {};
    const taskOperations = documentedOperations().filter((op) => /\/tasks(\/|$)/.test(op));

    expect(taskOperations).toHaveLength(5);
    for (const operation of taskOperations) {
      const [method, path] = operation.split(' ') as [string, string];
      const item = paths[path]?.[method.toLowerCase() as 'get'];
      expect(item?.tags, operation).toEqual(['tasks']);
    }
  });

  it('is served at GET /api/openapi.json', async () => {
    const response = await request(createApp({ db })).get('/api/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(JSON.parse(JSON.stringify(getOpenApiDocument())));
  });

  it('matches the committed apps/api/openapi.json (run `pnpm openapi:generate`)', () => {
    expect(readFileSync(OPENAPI_FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(
      serializeOpenApiDocument(getOpenApiDocument()),
    );
  });
});

describe('toOpenApiPath', () => {
  it('converts Express parameters to OpenAPI templates', () => {
    expect(toOpenApiPath('/api/projects/:id/tasks')).toBe('/api/projects/{id}/tasks');
  });
});
