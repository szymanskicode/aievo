/** Set to `1` by the Playwright config, and only there. */
export const E2E_FLAG = 'AIEVO_E2E_FAKES';

/**
 * The E2E worker fakes the model, git and GitHub, and would report made-up pull requests as
 * real ones. It refuses to start unless the flag is set and the database is a throwaway test
 * database (its name ends in `_test`, like every database the test setups wipe).
 */
export function assertE2eMode(env: NodeJS.ProcessEnv, databaseUrl: string): void {
  if (env[E2E_FLAG] !== '1') {
    throw new Error(`The E2E worker only starts with ${E2E_FLAG}=1; run the real worker instead.`);
  }
  let database: string;
  try {
    database = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('The E2E worker needs a valid DATABASE_URL.');
  }
  if (!database.endsWith('_test')) {
    throw new Error(
      `The E2E worker only runs against a test database (name ending in _test), not "${database}".`,
    );
  }
}
