export function requireDatabaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  const url = source.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }
  return url;
}
