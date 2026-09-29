import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // components/ui is vendored shadcn/ui code; main.tsx only mounts the app.
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/components/ui/**', 'src/main.tsx'],
      reporter: ['text', 'json-summary', 'html'],
    },
  },
});
