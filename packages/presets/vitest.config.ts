import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.templates-test.ts', 'src/test/**'],
      reporter: ['text', 'json-summary', 'html'],
    },
  },
});
