import { createDb } from '../client.js';
import { runMigrations } from '../migrate.js';
import { requireDatabaseUrl } from './env.js';

const { db, close } = createDb(requireDatabaseUrl());

try {
  await runMigrations(db);
  console.log('Migrations applied.');
} finally {
  await close();
}
