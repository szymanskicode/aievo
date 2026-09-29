import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  assertTestDatabaseUrl,
  closeTestDb,
  createDatabaseIfMissing,
  getTestDb,
  testDatabaseUrl,
} from './db.js';

describe('testDatabaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a database whose name ends in _test', () => {
    vi.stubEnv('DATABASE_URL_TEST', 'postgresql://u:p@127.0.0.1:5432/other_test');
    expect(testDatabaseUrl()).toBe('postgresql://u:p@127.0.0.1:5432/other_test');
  });

  it('refuses the development database', () => {
    vi.stubEnv('DATABASE_URL_TEST', 'postgresql://u:p@127.0.0.1:5432/aievo');
    expect(() => testDatabaseUrl()).toThrow(/must end in _test/);
  });
});

describe('assertTestDatabaseUrl', () => {
  it('returns a test database URL unchanged', () => {
    const url = 'postgresql://u:p@127.0.0.1:5432/aievo_e2e_test';
    expect(assertTestDatabaseUrl(url)).toBe(url);
  });

  it('refuses a database whose name does not end in _test', () => {
    expect(() => assertTestDatabaseUrl('postgresql://u:p@127.0.0.1:5432/aievo')).toThrow(
      /must end in _test/,
    );
  });
});

// Needs the CREATEDB privilege, like `createDatabaseIfMissing` itself.
describe('createDatabaseIfMissing', () => {
  // A fixed name, dropped before and after, so an interrupted run leaves nothing behind.
  const name = 'aievo_tmp_create_test';
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${name}`;

  async function databaseExists(): Promise<boolean> {
    const result = await getTestDb().execute(
      sql`SELECT 1 FROM pg_database WHERE datname = ${name}`,
    );
    return result.rows.length > 0;
  }

  async function dropDatabase(): Promise<void> {
    await getTestDb().execute(sql`DROP DATABASE IF EXISTS ${sql.identifier(name)}`);
  }

  beforeAll(dropDatabase);

  afterAll(async () => {
    await dropDatabase();
    await closeTestDb();
  });

  it('creates the database once and leaves an existing one alone', async () => {
    expect(await databaseExists()).toBe(false);

    await createDatabaseIfMissing(url.toString());
    expect(await databaseExists()).toBe(true);

    await expect(createDatabaseIfMissing(url.toString())).resolves.toBeUndefined();
  });

  it('refuses databases that are not test databases', async () => {
    await expect(createDatabaseIfMissing('postgresql://u:p@127.0.0.1:5432/aievo')).rejects.toThrow(
      /must end in _test/,
    );
  });
});
