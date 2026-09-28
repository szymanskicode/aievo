import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().max(65535).default(3001),
  // Default matches docker-compose.yml (local credentials, not a secret).
  DATABASE_URL: z.url().default('postgresql://aievo:aievo@127.0.0.1:5432/aievo'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/** The API listens on loopback only: there is no authentication yet. */
export const API_HOST = '127.0.0.1';

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${issues}`);
  }

  return result.data;
}
