import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The schema lands here in the next step; until then there is nothing to run.
    passWithNoTests: true,
  },
});
