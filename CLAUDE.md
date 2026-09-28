# AIEvo

Self-hosted platforma, w której konfigurowalni agenci AI realizują taski w projektach podpiętych pod repozytoria GitHub. Każda zmiana kończy się pull requestem z testami, który zatwierdza człowiek. Użytkownik podpina własne klucze do modeli (BYOK).

Pełna architektura: `docs/architecture.md`. Czytaj z niej tylko sekcje potrzebne do bieżącego zadania (spis treści na początku pliku). Instrukcja startu: `START.md`.

## Aktualny etap

**Etap 1: Fundament** (roadmapa w sekcji 17 `docs/architecture.md`).
Cel etapu: monorepo, baza, REST API, UI projektów i tasków, rejestr dostawców modeli. Warunek ukończenia: task utworzony w UI jest zapisany w bazie, a wszystkie testy przechodzą.

Nie buduj niczego z późniejszych etapów (worker, sandbox, agenci, pipeline, GitHub). Jeśli coś z nich wydaje się potrzebne, zatrzymaj się i zapytaj.

## Stack (decyzje podjęte, nie zmieniaj bez pytania)

- Monorepo: pnpm workspaces + Turborepo, TypeScript w trybie strict, Node.js 24.
- Frontend `apps/web`: React + Vite, TanStack Router, TanStack Query, Zustand, Tailwind CSS + shadcn/ui, React Hook Form + Zod.
- API `apps/api`: Express 5, pełne REST, OpenAPI generowane ze schematów Zod, SSE dla zdarzeń na żywo (od etapu 3), logi pino.
- Baza `packages/db`: PostgreSQL 16 + Drizzle ORM (migracje w repo). Kolejka w późniejszych etapach: pg-boss (bez Redisa).
- Modele `packages/llm`: własny interfejs `LlmClient` na Vercel AI SDK, rejestr typów dostawców (anthropic, openai, openai-compatible).
- Wspólne typy i schematy Zod: `packages/shared`. Klient API dla frontendu: `packages/api-client` (generowany z OpenAPI).
- Testy: Vitest (jednostkowe i integracyjne), Testing Library (komponenty), Playwright (E2E).
- Brak logowania: jeden lokalny użytkownik. API i frontend nasłuchują tylko na 127.0.0.1.

## Zasady pracy

1. **Najpierw plan, potem kod.** Przy każdym większym kroku przedstaw krótki plan (pliki, kroki, ryzyka) i poczekaj na akceptację.
2. **Nowy kod = nowe testy.** Każda nowa lub zmieniona logika ma testy w tym samym kroku. Nie kończ zadania z czerwonymi testami, `skip` ani `only`.
3. **Nie zmieniaj istniejących testów, żeby przeszły.** Jeśli test jest nieaktualny, powiedz dlaczego i zaproponuj zmianę.
4. **Małe kroki.** Jedno zadanie = jedna spójna zmiana, którą da się przejrzeć w kilka minut.
5. **Weryfikuj sam.** Przed zgłoszeniem końca uruchom `pnpm typecheck && pnpm lint && pnpm test` (i `pnpm build`, gdy dotyczy) i pokaż wynik.
6. **Schematy Zod w jednym miejscu.** Walidacja API, typy frontendu i OpenAPI pochodzą z tych samych schematów w `packages/shared`.
7. **`workspaceId` wszędzie.** Każda tabela z danymi użytkownika ma `workspaceId` (bezpośrednio lub przez rodzica) i każde zapytanie go filtruje.
8. **Sekrety.** Klucze API i tokeny tylko zaszyfrowane (AES-256-GCM, klucz główny z `AIEVO_MASTER_KEY`). Nigdy nie zwracaj ich z API, nie loguj, nie wpisuj do testów ani commitów. Nie czytaj pliku `.env`; używaj `.env.example`.
9. **Nie zmieniaj `docs/architecture.md` bez prośby.** Gdy decyzja z dokumentu okazuje się zła, powiedz o tym i zaproponuj zmianę sekcji 18.
10. **Nie rób commitów ani push.** Na końcu zadania zaproponuj wiadomość commita (Conventional Commits, po angielsku). Commit robi człowiek po review.
11. **Zależności.** Używaj aktualnych stabilnych wersji. Przed dodaniem nowej biblioteki spoza listy w sekcji 4 dokumentu architektury zapytaj.
12. **Bez atrybucji AI w commitach.** Nie dopisuj do wiadomości commitów informacji, że powstały przy współpracy z AI (np. `Co-Authored-By: Claude ...`, „Generated with Claude Code”).

## Konwencje

- Kod, nazwy, komentarze w kodzie i wiadomości commitów: po angielsku. Dokumentacja w `docs/` i rozmowa: po polsku.
- ESM, `import type` dla typów, bez `any` (wyjątek: z komentarzem dlaczego).
- Nazwy plików: `kebab-case.ts`; komponenty React: `PascalCase.tsx`.
- Testy obok kodu: `*.test.ts` / `*.test.tsx`; E2E w `apps/web/e2e/`.
- Błędy API w jednym formacie: `{ error: { code, message, details? } }`.
- Daty w bazie jako `timestamptz`, identyfikatory jako UUID.

## Komendy

```bash
pnpm install          # instalacja
docker compose up -d  # PostgreSQL
pnpm db:migrate       # migracje
pnpm db:seed          # domyślny workspace i dane startowe
pnpm dev              # api + web w trybie dev
pnpm typecheck
pnpm lint
pnpm test             # wszystkie testy
pnpm test:e2e         # Playwright
pnpm build
```

Komendy powstają w pierwszym prompcie etapu 1; jeśli któraś nie działa, napraw ją, zamiast ją omijać.

## Definicja „gotowe” dla zadania

- Zakres zadania zrealizowany, nic spoza zakresu.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` przechodzą; nowy kod ma testy.
- Brak sekretów w kodzie, logach i odpowiedziach API.
- Krótkie podsumowanie: co zrobione, jak sprawdzić ręcznie, propozycja wiadomości commita, co zostaje na później.
