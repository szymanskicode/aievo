import { defineConfig } from 'vitest/config';

// Tools against a real sandbox container: `pnpm test:docker` (needs `pnpm sandbox:build`).
export default defineConfig({
  test: {
    include: ['src/**/*.docker-test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
