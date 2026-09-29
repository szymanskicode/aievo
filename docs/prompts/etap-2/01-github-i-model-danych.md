# Prompt 1 z 7: token GitHub, adapter Git i tabele runów

Wklej całość do Claude Code w trybie planu (po `/clear`).

---

Zaczynamy etap 2. Przeczytaj `CLAUDE.md` oraz sekcje 5, 10 i 15 w `docs/architecture.md`. Najpierw krótko sprawdź stan repo po etapie 1 (struktura pakietów, schemat bazy, format błędów API), żeby nowy kod był z nim spójny. Jeśli coś w kodzie różni się od dokumentu architektury, wypisz różnice przed planem.

**Zadanie:** fundament integracji z GitHubem i model danych dla runów agentów.

**Zakres:**

1. **Nowe tabele** (migracja Drizzle, wszystko z `workspaceId` bezpośrednio lub przez rodzica):
   - `git_credential`: id, workspaceId, provider (`github`), label, encryptedToken (ten sam mechanizm szyfrowania co klucze modeli), tokenHint, githubLogin, expiresAt (nullable), createdAt, updatedAt.
   - `run`: id, taskId, status (`queued` | `preparing` | `running` | `committing` | `succeeded` | `failed` | `cancelled`), branch, prUrl, prNumber, costUsd, tokensIn, tokensOut, error (JSONB, nullable), startedAt, endedAt, createdAt.
   - `step`: id, runId, stepKey, agentKey, agentVersion (hash pliku presetu), iteration, status, input (JSONB), output (JSONB), costUsd, tokensIn, tokensOut, startedAt, endedAt.
   - `tool_call`: id, stepId, tool, args (JSONB), result (tekst przycięty do ustalonego limitu), isError, durationMs, exitCode (nullable), createdAt.
   - `project`: dodaj `repoOwner`, `repoName`, `gitCredentialId` (nullable) oraz w `settings` komendy projektu (install, build, lint, test, coverage, dev) jako schemat Zod.
2. **`packages/git`** z interfejsem `GitProvider` i implementacją GitHub (Octokit). Adapter udostępnia **wyłącznie** operacje z sekcji 10: sprawdzenie tokenu (login, uprawnienia, data wygaśnięcia), lista właścicieli (konto i organizacje), lista repo, utworzenie repo, utworzenie pierwszego commita w pustym repo, utworzenie PR, odczyt komentarzy PR. Żadnego usuwania repo ani zmiany ustawień. Operacje git CLI (klon, commit, push) powstaną w prompcie 3.
3. **Endpointy:**
   - `GET /api/git-credentials`, `POST /api/git-credentials` (walidacja tokenu przy zapisie: login i brakujące uprawnienia w czytelnym komunikacie), `DELETE /api/git-credentials/:id`
   - `GET /api/github/owners`, `GET /api/github/repos?owner=`
4. **Zasady bezpieczeństwa:** token nigdy w odpowiedzi API ani w logach (tylko `tokenHint`); ta sama redakcja pino co dla kluczy modeli.

**Testy:**

- Migracje od zera na bazie testowej.
- `packages/git` z zamockowanym API GitHuba (msw): sprawdzenie tokenu, listy, obsługa 401/403/404 i limitu zapytań (rate limit) jako czytelne błędy.
- Endpointy: token nigdy nie pojawia się w odpowiedzi; izolacja workspace'ów.
- Test „białej listy”: publiczny interfejs `GitProvider` ma dokładnie dozwolone metody (test na liście metod), żeby przypadkowe dodanie np. usuwania repo było widoczne w review.

**Poza zakresem:** tworzenie projektu z repo (prompt 2), worker, sandbox, agent.

**Kryteria akceptacji:** `pnpm typecheck`, `pnpm lint`, `pnpm test` przechodzą; ręcznie przez `curl` da się zapisać prawdziwy token GitHub i zobaczyć listę swoich repozytoriów.

Najpierw plan, potem realizacja po mojej akceptacji. Na końcu pokaż wyniki komend i zaproponuj wiadomość commita.
