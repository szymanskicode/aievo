# AIEvo

Self-hosted platform where configurable AI agents deliver tasks in projects backed by GitHub
repositories. Every change ends as a pull request with tests, approved by a human. You bring your own
model API keys (BYOK).

Architecture: [`docs/architecture.md`](docs/architecture.md). Getting started: [`START.md`](START.md).

> **Current stage: 2 — First agent.** Stage 1 (monorepo, database, REST API, project and task UI,
> model provider registry) is done as `v0.1.0`. Stage 2 adds the GitHub integration, the worker, the
> Docker sandbox and the first agent that opens a pull request.

## Requirements

- **Node.js 24** (see `.nvmrc`)
- **pnpm** — `corepack enable`
- **Docker** with Compose — for PostgreSQL 16

## Getting started

```bash
pnpm install            # install dependencies
cp .env.example .env    # then fill in AIEVO_MASTER_KEY (the file says how)
docker compose up -d    # PostgreSQL on 127.0.0.1:5432
pnpm db:migrate         # create the schema
pnpm db:seed            # default workspace and a sample project
pnpm dev                # API on 127.0.0.1:3001, web on 127.0.0.1:5173
```

Open <http://127.0.0.1:5173>. The dev server proxies `/api` to the API, so
<http://127.0.0.1:5173/api/health> returns `{"status":"ok"}`.

To check that everything works, build and run the tests (PostgreSQL must be running):

```bash
pnpm build
pnpm test                                                 # unit and integration tests
pnpm --filter @aievo/web exec playwright install chromium # once, before the first E2E run
pnpm test:e2e                                             # Playwright, starts its own API and web
```

### Test databases

`pnpm test` and `pnpm test:e2e` need PostgreSQL from `docker compose up -d`. They use their own
databases, `aievo_test` (`DATABASE_URL_TEST`) and `aievo_e2e_test` (`DATABASE_URL_E2E`), which are
wiped on every run; a test database name must end in `_test`. Both are created by
`docker/postgres/init/` when the volume is first initialised. E2E also creates its database if it
is missing; for an older volume without `aievo_test`, run
`docker exec aievo-db createdb -U aievo -O aievo aievo_test`. E2E runs the API on 127.0.0.1:3101
and the web app on 127.0.0.1:5174, so it does not clash with `pnpm dev`.

To start over from an empty database: `docker compose down -v`, then `docker compose up -d`,
`pnpm db:migrate` and `pnpm db:seed`. This deletes all local data.

Nothing listens outside `127.0.0.1`: there is no authentication yet, a single local user is assumed.

## Commands

| Command                    | What it does                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                 | API and web in watch mode                                                                                                                                     |
| `pnpm build`               | Build every package and app                                                                                                                                   |
| `pnpm typecheck`           | TypeScript across the monorepo                                                                                                                                |
| `pnpm lint`                | ESLint, zero warnings allowed                                                                                                                                 |
| `pnpm test`                | Vitest in every package (needs PostgreSQL running)                                                                                                            |
| `pnpm test:coverage`       | Vitest with V8 coverage; per-package report in `<package>/coverage/`                                                                                          |
| `pnpm format`              | Prettier, write                                                                                                                                               |
| `pnpm format:check`        | Prettier, check only                                                                                                                                          |
| `pnpm db:generate`         | Generate a new Drizzle migration after a schema change                                                                                                        |
| `pnpm db:migrate`          | Drizzle migrations                                                                                                                                            |
| `pnpm db:seed`             | Default workspace and seed data                                                                                                                               |
| `pnpm test:e2e`            | Playwright against the real API and the `aievo_e2e_test` database (wiped on every run); first run `pnpm --filter @aievo/web exec playwright install chromium` |
| `pnpm openapi:generate`    | Write `apps/api/openapi.json` (also served at `/api/openapi.json`); needs `pnpm build` first                                                                  |
| `pnpm api-client:generate` | Regenerate the typed client in `packages/api-client` from `apps/api/openapi.json`; `pnpm build` and `pnpm typecheck` fail while it is stale                   |

## Layout

```
apps/api            Express 5: REST API under /api, pino logs
apps/web            React + Vite SPA (TanStack Router/Query, Tailwind, shadcn/ui); E2E in e2e/
packages/shared     Zod schemas and types shared by API and web
packages/api-client Typed REST client generated from the OpenAPI document
packages/db         Drizzle schema, migrations, seed and workspace-scoped repositories
packages/llm        Model provider registry (Anthropic, OpenAI, OpenAI-compatible) and LlmClient
docker/             PostgreSQL init scripts
```

## Notes

- **TypeScript is pinned to 5.9.** TypeScript 7 (the native compiler) is out, but `typescript-eslint`
  still requires `<6.1.0`. The pin lifts once the linter supports it.
- **Docker on Windows** installs per user. If `docker` is not found after installing Docker Desktop,
  open a new terminal or add `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin` to `PATH`, and make
  sure Docker Desktop itself is running.
