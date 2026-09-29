import { defineConfig } from 'vitest/config';

/**
 * Installs each template's dependencies and runs its scripts in a temporary directory.
 * Slow and needs the network, so it runs only through `pnpm test:templates`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.templates-test.ts'],
    testTimeout: 10 * 60_000,
    hookTimeout: 10 * 60_000,
  },
});
