import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Component tests arrive together with the UI (Testing Library, later step).
    passWithNoTests: true,
  },
});
