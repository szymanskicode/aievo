import { createDb } from '../client.js';
import { runMigrations } from '../migrate.js';
import { CONNECTION_HELP, dropAll, testDatabaseUrl } from './db.js';

/** Rebuilds the test database from an empty schema before the suite runs. */
export default async function setup(): Promise<void> {
  const { db, close } = createDb(testDatabaseUrl());
  try {
    await dropAll(db);
    await runMigrations(db);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ECONNREFUSED' || code === '3D000') {
      throw new Error(CONNECTION_HELP, { cause: error });
    }
    throw error;
  } finally {
    await close();
  }
}
