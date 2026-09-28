# Prompt 1 z 6: szkielet monorepo

Wklej całość do Claude Code w trybie planu.

---

Zaczynamy budowę AIEvo. Przeczytaj `CLAUDE.md` oraz sekcje 1, 4 i 17 w `docs/architecture.md`.

**Zadanie:** postaw szkielet monorepo, na którym powstanie cały etap 1. Bez logiki biznesowej.

**Zakres:**

1. pnpm workspaces + Turborepo w katalogu głównym. Plik `.nvmrc` (Node 22) i pole `packageManager` w `package.json`.
2. Wspólna konfiguracja TypeScript (`tsconfig.base.json`, tryb strict, ESM), ESLint (flat config) i Prettier dla całego repo.
3. Pakiety i aplikacje (tylko te, które są potrzebne w etapie 1):
   - `apps/api`: Express 5 z endpointem `GET /api/health` zwracającym `{ status: "ok" }` (wszystkie trasy API będą pod prefiksem `/api`), nasłuch na `127.0.0.1` i porcie z `API_PORT` (domyślnie 3001), logi pino.
   - `apps/web`: React + Vite + TypeScript, pusta strona „AIEvo”, dev server na `127.0.0.1:5173` z proxy `/api` → API (bez obcinania prefiksu).
   - `packages/shared`: miejsce na schematy Zod i typy, eksport jednego przykładowego schematu z testem.
   - `packages/db`: pusty pakiet z konfiguracją Drizzle (schemat powstanie w następnym prompcie).
4. `docker-compose.yml` z PostgreSQL 16 (wolumen na dane, healthcheck, port tylko na 127.0.0.1). Dwie bazy: `aievo` i `aievo_test` (skrypt init).
5. `.env.example` z opisanymi zmiennymi: `DATABASE_URL`, `DATABASE_URL_TEST`, `API_PORT`, `AIEVO_MASTER_KEY` (z instrukcją, jak wygenerować 32 bajty w base64).
6. Skrypty w głównym `package.json` przez Turborepo: `dev`, `build`, `typecheck`, `lint`, `test`, `format`. Pozostałe (`db:migrate`, `db:seed`, `test:e2e`) mogą na razie wypisywać „not implemented”.
7. Vitest skonfigurowany w każdym pakiecie. Test dla `GET /api/health` (supertest) i test schematu w `packages/shared`.
8. Krótki `README.md`: czym jest AIEvo, wymagania, jak uruchomić lokalnie.

**Poza zakresem:** schemat bazy, prawdziwe endpointy, UI poza pustą stroną, Tailwind i biblioteki UI (dojdą w prompcie 5).

**Kryteria akceptacji:**

- `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` przechodzą bez błędów i ostrzeżeń.
- `docker compose up -d` stawia PostgreSQL, a healthcheck jest zielony.
- `pnpm dev` uruchamia API i web; `http://127.0.0.1:5173` pokazuje stronę, a `/api/health` przez proxy zwraca `{ status: "ok" }`.

Najpierw przedstaw plan: strukturę katalogów, listę zależności z uzasadnieniem i kolejność kroków. Po mojej akceptacji realizuj, a na końcu uruchom wszystkie komendy z kryteriów i pokaż wyniki. Zaproponuj wiadomość commita.
