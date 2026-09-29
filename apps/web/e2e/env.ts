/** Ports of the servers started for E2E tests; different from `pnpm dev` (3001, 5173). */
export const E2E_API_PORT = 3101;
export const E2E_WEB_PORT = 5174;

// Credentials from docker-compose.yml; not a secret.
const DEFAULT_E2E_DATABASE_URL = 'postgresql://aievo:aievo@127.0.0.1:5432/aievo_e2e_test';

/** Database used by E2E runs. It is wiped on every run, so its name must end in `_test`. */
export function e2eDatabaseUrl(): string {
  return process.env.DATABASE_URL_E2E ?? DEFAULT_E2E_DATABASE_URL;
}
