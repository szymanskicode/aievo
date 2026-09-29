import { defineConfig } from 'vitest/config';

// Integration tests against a real Docker engine: `pnpm test:docker` (needs `pnpm sandbox:build`).
export default defineConfig({
  test: {
    include: ['src/**/*.docker-test.ts'],
    globalSetup: ['src/test/docker-setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Containers are counted by label; files must not see each other's.
    fileParallelism: false,
  },
});
