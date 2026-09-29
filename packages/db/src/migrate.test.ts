import { runStatuses } from '@aievo/shared';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { runMigrations } from './migrate.js';
import { closeTestDb, dropAll, getTestDb } from './test/db.js';

const db = getTestDb();

afterAll(closeTestDb);

async function tableNames(): Promise<string[]> {
  const result = await db.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

describe('runMigrations', () => {
  it('creates every table on an empty database', async () => {
    await dropAll(db);
    expect(await tableNames()).toEqual([]);

    await runMigrations(db);

    expect(await tableNames()).toEqual([
      'git_credential',
      'membership',
      'model',
      'project',
      'provider_credential',
      'run',
      'step',
      'task',
      'tool_call',
      'user',
      'workspace',
    ]);
  });

  it('creates the task status enum with the lifecycle values', async () => {
    const result = await db.execute<{ value: string }>(
      sql`SELECT unnest(enum_range(NULL::task_status))::text AS value`,
    );
    expect(result.rows.map((row) => row.value)).toContain('needs_human');
  });

  it('creates the run status enum in lifecycle order', async () => {
    const result = await db.execute<{ value: string }>(
      sql`SELECT unnest(enum_range(NULL::run_status))::text AS value`,
    );
    expect(result.rows.map((row) => row.value)).toEqual([...runStatuses]);
  });

  it('is a no-op when run again', async () => {
    const journal = () =>
      db.execute<{ count: string }>(sql`SELECT count(*) FROM drizzle.__drizzle_migrations`);
    const before = (await journal()).rows[0]?.count;

    await runMigrations(db);

    expect((await journal()).rows[0]?.count).toBe(before);
  });
});
