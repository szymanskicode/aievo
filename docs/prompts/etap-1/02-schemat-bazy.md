# Prompt 2 z 6: schemat bazy

Wklej całość do Claude Code w trybie planu (po `/clear`).

---

Przeczytaj `CLAUDE.md` oraz sekcje 5 i 9 w `docs/architecture.md`.

**Zadanie:** schemat bazy danych etapu 1 w `packages/db` (Drizzle + PostgreSQL), z migracjami, seedem i testami.

**Tabele etapu 1** (tylko te):

- `workspace`: id, name, settings (JSONB), limits (JSONB), createdAt, updatedAt.
- `user`: id, email (nullable), displayName, createdAt. Na start jeden lokalny użytkownik.
- `membership`: workspaceId, userId, role (`owner` | `member` | `viewer`).
- `provider_credential`: id, workspaceId, type (`anthropic` | `openai` | `openai-compatible`), label, encryptedKey (tekst, format z prompta 4), keyHint (ostatnie 4 znaki), baseUrl (nullable), createdAt, updatedAt.
- `model`: id, workspaceId, providerId, modelId, displayName, capabilities (JSONB: tools, vision, structuredOutput, promptCaching, reasoning, contextWindow, maxOutput), priceIn i priceOut (USD za milion tokenów, nullable), enabled.
- `project`: id, workspaceId, name, description, repoUrl (nullable w etapie 1), defaultBranch (domyślnie `main`), settings (JSONB), testPolicy (JSONB), createdAt, updatedAt.
- `task`: id, projectId, title, description, type (`feature` | `bug` | `refactor` | `test` | `chore`), priority (`low` | `medium` | `high`), status (enum ze statusami z sekcji 8), acceptanceCriteria (tekst), labels (text[]), position (do kolejności na tablicy), parentId (nullable), createdAt, updatedAt.

**Wymagania:**

1. Kształty kolumn JSONB opisane schematami Zod w `packages/shared` i walidowane przy zapisie.
2. Klucze obce z sensownym `onDelete`, indeksy na kolumnach używanych do filtrowania (`workspaceId`, `projectId`, `status`).
3. Migracje generowane przez drizzle-kit i commitowane do repo. Skrypty `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed` w głównym `package.json`.
4. Seed idempotentny: domyślny workspace „Default”, lokalny użytkownik jako owner, przykładowy projekt „AIEvo” z trzema taskami.
5. Warstwa dostępu do danych (repozytoria lub funkcje zapytań) dla `project` i `task`, gdzie każda funkcja wymaga `workspaceId`.
6. Testy integracyjne na bazie `aievo_test`: migracje od zera, CRUD projektu i taska, izolacja workspace'ów (dane jednego workspace'u niewidoczne z drugiego), idempotentność seeda. Baza czyszczona między testami.

**Poza zakresem:** tabele z późniejszych etapów (agent, run, step, pipeline…), endpointy API.

**Kryteria akceptacji:** `pnpm db:migrate` na pustej bazie działa, `pnpm db:seed` uruchomiony dwa razy nie tworzy duplikatów, a `pnpm typecheck`, `pnpm lint` i `pnpm test` przechodzą.

Najpierw plan (schemat tabel w skrócie, strategia testów bazy), potem realizacja po mojej akceptacji. Na końcu pokaż wyniki komend i zaproponuj wiadomość commita.
