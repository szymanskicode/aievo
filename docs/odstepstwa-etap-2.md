# Świadome odstępstwa od `architecture.md` w etapie 2

Lista punktów do przeniesienia do `docs/architecture.md` (sekcje 10, 11, 18) na koniec etapu 2 (prompt 7). Dopisuj tu kolejne odstępstwa, zamiast zmieniać dokument architektury w trakcie etapu.

## 1. Pierwszy commit nowego repo robi API przez Git Data API (prompt 2)

- **Dokument (sekcja 10, ścieżka B, krok 3):** worker kopiuje szablon do sandboxa, podstawia nazwę projektu, robi pierwszy commit na `main` i push.
- **Stan faktyczny:** `POST /api/projects` z `mode: "new"` tworzy repo przez `GitProvider.createRepo`, a pierwszy commit robi przez `GitProvider.createInitialCommit` (Contents API dla pliku startowego, potem blob → tree → commit bez rodzica → przestawienie refa; w historii zostaje jeden commit). Pliki szablonu czyta `@aievo/presets` z podstawionymi placeholderami; pliki binarne są pomijane.
- **Dlaczego:** prostsze, nie wymaga Dockera ani klonowania, a zapis na gałąź bazową nadal wykonuje platforma, nie agent.
- **Skutek uboczny:** błąd po utworzeniu repo (commit albo zapis projektu) nie usuwa repo, bo adapter nie ma takiej operacji. API zwraca `project_setup_failed` z linkiem do repo, a projekt nie powstaje.
- **Proponowana zmiana:** sekcja 10, ścieżka B, krok 3 oraz wiersz „Tworzenie repo” w sekcji 18.

## 2. Szablon React ma `package-lock.json` i lintuje przez oxlint (prompt 2)

- Szablon `react-vite-ts` zawiera lockfile, żeby pierwszy commit i `npm ci` były powtarzalne (bez lockfile'a instalacja pobierała paczki opublikowane minuty wcześniej, których rejestr jeszcze nie serwował).
- Lint w szablonie to `oxlint` (jak w aktualnym `create-vite`), nie ESLint.
- Lockfile odświeża się przy podnoszeniu wersji szablonu; `pnpm test:templates` sprawdza, że pasuje do `package.json` (`npm ci`).

## 3. Adapter Git ma operację `getRepo` (prompt 2, po review)

- **Dokument (sekcja 10) i prompt 1:** lista dozwolonych operacji adaptera obejmuje „lista repo”, bez odczytu pojedynczego repo.
- **Stan faktyczny:** `GitProvider.getRepo(owner, name)` (`GET /repos/{owner}/{repo}`), tylko do odczytu. Kreator (ścieżka A) sprawdza nim, czy token widzi wskazane repo, zamiast przeszukiwać listę ograniczoną do 1000 repo.
- **Proponowana zmiana:** sekcja 10, zdanie o liście dozwolonych operacji: „lista repo i odczyt repo”.
