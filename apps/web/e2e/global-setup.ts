import { createDb, seed } from '@aievo/db';
import { createDatabaseIfMissing, rebuildTestDatabase } from '@aievo/db/testing';

import { e2eDatabaseUrl } from './env';

/** Starts every run from a freshly migrated and seeded database. */
export default async function globalSetup(): Promise<void> {
  const url = e2eDatabaseUrl();
  await createDatabaseIfMissing(url);
  await rebuildTestDatabase(url);

  const { db, close } = createDb(url);
  try {
    await seed(db);
  } finally {
    await close();
  }
}
