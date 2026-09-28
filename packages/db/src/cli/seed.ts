import { createDb } from '../client.js';
import { seed } from '../seed.js';
import { requireDatabaseUrl } from './env.js';

const { db, close } = createDb(requireDatabaseUrl());

try {
  await seed(db);
  console.log('Seed data is in place.');
} finally {
  await close();
}
