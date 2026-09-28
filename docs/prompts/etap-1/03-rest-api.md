# Prompt 3 z 6: REST API projektów i tasków

Wklej całość do Claude Code w trybie planu (po `/clear`).

---

Przeczytaj `CLAUDE.md` oraz sekcję 13 w `docs/architecture.md`.

**Zadanie:** REST API dla projektów i tasków w `apps/api` (Express 5) z dokumentacją OpenAPI generowaną ze schematów Zod.

**Zakres:**

1. Struktura aplikacji: podział na moduły (`projects`, `tasks`), fabryka aplikacji (`createApp(deps)`) oddzielona od startu serwera, żeby testy nie otwierały portu.
2. Middleware: walidacja `body`, `params` i `query` schematami Zod z `packages/shared`; centralna obsługa błędów w formacie `{ error: { code, message, details? } }`; logowanie żądań przez pino (bez treści nagłówków autoryzacji).
3. Bieżący workspace: na start zawsze domyślny workspace z seeda, rozwiązywany w jednym miejscu (middleware), żeby później łatwo dodać wybór workspace'u.
4. Endpointy (wszystkie pod prefiksem `/api`):
   - `GET /api/projects`, `POST /api/projects`, `GET /api/projects/:id`, `PATCH /api/projects/:id`, `DELETE /api/projects/:id`
   - `GET /api/projects/:id/tasks` (filtrowanie po `status`), `POST /api/projects/:id/tasks`
   - `GET /api/tasks/:id`, `PATCH /api/tasks/:id` (w tym zmiana `status` i `position`), `DELETE /api/tasks/:id`
5. OpenAPI 3.1 generowane ze schematów Zod (np. `@asteasolutions/zod-to-openapi`), dostępne pod `GET /api/openapi.json`, plus skrypt zapisujący plik `apps/api/openapi.json` do repo (`pnpm openapi:generate`).
6. Prefiks `/api` jest spójny z proxy frontendu z prompta 1. W `docs/architecture.md` ścieżki podano bez prefiksu.

**Testy (supertest + baza testowa):**

- Happy path każdego endpointu.
- Walidacja: niepoprawne dane → 400 w ustalonym formacie.
- Nieistniejący zasób → 404.
- Izolacja workspace'u: zasób innego workspace'u → 404, nie 403 (nie ujawniamy istnienia).
- Zgodność: każdy endpoint jest opisany w wygenerowanym OpenAPI (test porównujący listę tras).

**Poza zakresem:** dostawcy modeli (prompt 4), frontend, SSE, uwierzytelnianie.

**Kryteria akceptacji:** `pnpm typecheck`, `pnpm lint`, `pnpm test` przechodzą; `curl http://127.0.0.1:3001/api/openapi.json` zwraca poprawną specyfikację; ręcznie da się utworzyć projekt i task przez `curl`.

Najpierw plan (struktura modułów, lista schematów w `packages/shared`), potem realizacja po mojej akceptacji. Na końcu pokaż wyniki komend, przykładowe wywołania `curl` do ręcznego sprawdzenia i zaproponuj wiadomość commita.
