import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  // API_PORT lives in the repo-root .env, which Vite does not read on its own.
  // Without this the API could move while the proxy kept pointing at 3001.
  const env = loadEnv(mode, repoRoot, '');
  const apiPort = env.API_PORT ?? '3001';

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        // The `/api` prefix is part of the API contract, so it is forwarded as-is.
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: false,
        },
      },
    },
  };
});
