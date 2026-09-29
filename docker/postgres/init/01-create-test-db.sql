-- The `aievo` database is created by POSTGRES_DB; this adds the one used by
-- integration tests. Runs only when the data volume is empty.
CREATE DATABASE aievo_test OWNER aievo;

-- Database of the Playwright tests (`pnpm test:e2e`); kept apart so E2E runs and
-- `pnpm test` never wipe each other's data. The E2E setup also creates it if missing.
CREATE DATABASE aievo_e2e_test OWNER aievo;
