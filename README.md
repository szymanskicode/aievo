# AIEvo

Self-hosted platform where configurable AI agents deliver tasks in projects backed by GitHub
repositories. Every change ends as a pull request with tests, approved by a human. You bring your own
model API keys (BYOK).

Architecture: [`docs/architecture.md`](docs/architecture.md). Getting started: [`START.md`](START.md).

> **Current stage: 1 — Foundation.** Monorepo, database, REST API, project and task UI, model provider
> registry. Workers, sandboxes, agents and the GitHub integration come later.

## Requirements

- **Node.js 24** (see `.nvmrc`)
- **pnpm** — `corepack enable`
- **Docker** with Compose — for PostgreSQL 16

## Getting started

```bash
pnpm install            # install dependencies
cp .env.example .env    # then fill in AIEVO_MASTER_KEY (the file says how)
docker compose up -d    # PostgreSQL on 127.0.0.1:5432
pnpm dev                # API on 127.0.0.1:3001, web on 127.0.0.1:5173
```

Open <http://127.0.0.1:5173>. The dev server proxies `/api` to the API, so
<http://127.0.0.1:5173/api/health> returns `{"status":"ok"}`.

Nothing listens outside `127.0.0.1`: there is no authentication yet, a single local user is assumed.

## Commands

| Command             | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `pnpm dev`          | API and web in watch mode                             |
| `pnpm build`        | Build every package and app                           |
| `pnpm typecheck`    | TypeScript across the monorepo                        |
| `pnpm lint`         | ESLint, zero warnings allowed                         |
| `pnpm test`         | Vitest in every package                               |
| `pnpm format`       | Prettier, write                                       |
| `pnpm format:check` | Prettier, check only                                  |
| `pnpm db:migrate`   | Drizzle migrations — not implemented yet              |
| `pnpm db:seed`      | Default workspace and seed data — not implemented yet |
| `pnpm test:e2e`     | Playwright — not implemented yet                      |

## Layout

```
apps/api        Express 5: REST API under /api, pino logs
apps/web        React + Vite single-page app
packages/shared Zod schemas and types shared by API and web
packages/db     Drizzle schema and migrations
docker/         PostgreSQL init scripts
```

## Notes

- **TypeScript is pinned to 5.9.** TypeScript 7 (the native compiler) is out, but `typescript-eslint`
  still requires `<6.1.0`. The pin lifts once the linter supports it.
- **Docker on Windows** installs per user. If `docker` is not found after installing Docker Desktop,
  open a new terminal or add `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin` to `PATH`, and make
  sure Docker Desktop itself is running.
