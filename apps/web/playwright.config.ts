import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { E2E_API_PORT, E2E_WEB_PORT, e2eDatabaseUrl } from './e2e/env';

const apiDir = fileURLToPath(new URL('../api', import.meta.url));

// A throwaway master key: E2E runs never store real provider keys, and it is never written down.
const masterKey = randomBytes(32).toString('base64');

/**
 * End-to-end tests against the real API and a dedicated database (`aievo_e2e_test`), so they
 * can run next to `pnpm test` and `pnpm dev`. Ports differ from the dev servers for the same reason.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // All tests share one database.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${E2E_WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Built by turbo before this task runs (`@aievo/web#test:e2e` depends on `@aievo/api#build`).
      command: 'node dist/index.js',
      cwd: apiDir,
      url: `http://127.0.0.1:${E2E_API_PORT}/api/health`,
      env: {
        API_PORT: String(E2E_API_PORT),
        DATABASE_URL: e2eDatabaseUrl(),
        AIEVO_MASTER_KEY: masterKey,
        LOG_LEVEL: 'warn',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `vite --port ${E2E_WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${E2E_WEB_PORT}`,
      // Read by vite.config.ts: the dev proxy forwards /api to the E2E API.
      env: { API_PORT: String(E2E_API_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
