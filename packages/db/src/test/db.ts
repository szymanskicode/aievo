import { sql } from 'drizzle-orm';

import { createDb } from '../client.js';
import type { Db } from '../client.js';

// Credentials from docker-compose.yml; not a secret.
const DEFAULT_TEST_URL = 'postgresql://aievo:aievo@127.0.0.1:5432/aievo_test';

/** The suite wipes the database, so refuse anything that is not clearly a test database. */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST ?? DEFAULT_TEST_URL;
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against "${name}": the database name must end in _test.`,
    );
  }
  return url;
}

export const CONNECTION_HELP =
  'Cannot connect to the test database. Start PostgreSQL with `docker compose up -d`. ' +
  'If the data volume predates the init script, create it with ' +
  '`docker exec aievo-db createdb -U aievo -O aievo aievo_test`.';

let shared: ReturnType<typeof createDb> | undefined;

/** One pool per test file; closed by `closeTestDb` in `afterAll`. */
export function getTestDb(): Db {
  shared ??= createDb(testDatabaseUrl());
  return shared.db;
}

export async function closeTestDb(): Promise<void> {
  await shared?.close();
  shared = undefined;
}

/**
 * Removes all rows from every table in `public`; the schema itself is created once by the
 * global setup. Tables are listed from the catalog so new ones are covered automatically.
 */
export async function resetDb(db: Db): Promise<void> {
  const result = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (result.rows.length === 0) return;

  const tables = sql.join(
    result.rows.map((row) => sql.identifier(row.tablename)),
    sql`, `,
  );
  await db.execute(sql`TRUNCATE TABLE ${tables} CASCADE`);
}

/** Drops everything (including drizzle's migration journal) so migrations run from zero. */
export async function dropAll(db: Db): Promise<void> {
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
}
