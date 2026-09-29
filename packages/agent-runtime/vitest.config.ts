import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.docker-test.ts', 'src/test/**', 'src/testing.ts'],
      reporter: ['text', 'json-summary', 'html'],
    },
  },
});
