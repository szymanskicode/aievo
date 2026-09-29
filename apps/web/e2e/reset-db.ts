/**
 * Starts every E2E run from a freshly migrated and seeded database. Run by the API's web
 * server command before the API starts: Playwright starts web servers before `globalSetup`,
 * and a rebuild there would drop the pg-boss schema the API and the worker already created.
 */
import { createDb, seed } from '@aievo/db';
import { createDatabaseIfMissing, rebuildTestDatabase } from '@aievo/db/testing';

import { e2eDatabaseUrl } from './env';

const url = e2eDatabaseUrl();
await createDatabaseIfMissing(url);
await rebuildTestDatabase(url);

const { db, close } = createDb(url);
try {
  await seed(db);
} finally {
  await close();
}
