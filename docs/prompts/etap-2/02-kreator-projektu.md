# Prompt 2 z 7: kreator projektu (istniejące repo albo nowe z szablonu)

Wklej całość do Claude Code w trybie planu (po `/clear`).

---

Przeczytaj `CLAUDE.md` oraz sekcje 10 i 14 w `docs/architecture.md`.

**Zadanie:** tworzenie projektu podpiętego pod repozytorium GitHub: podłączenie istniejącego repo (ścieżka A) albo utworzenie nowego repo z szablonu (ścieżka B), razem z UI kreatora.

**Zakres:**

1. **Szablony w `packages/presets/templates/`:**
   - `react-vite-ts/`: działający projekt React + Vite + TypeScript + Vitest z jednym komponentem i jednym testem, skryptami `dev`, `build`, `lint`, `test`, `test:coverage` oraz plikiem `docs/CONVENTIONS.md` (krótkie konwencje dla agentów).
   - `empty/`: tylko `README.md` i `.gitignore`.
   - W każdym manifest `template.yaml` zgodny z sekcją 10, walidowany schematem Zod. Placeholdery w plikach (np. `{{projectName}}`) podstawiane przy tworzeniu.
   - Test, który dla każdego szablonu sprawdza poprawność manifestu, a dla `react-vite-ts` instaluje zależności i uruchamia `test` oraz `build` w katalogu tymczasowym (osobny skrypt `pnpm test:templates`, bo trwa dłużej).
2. **Endpoint `GET /api/templates`** z listą szablonów i manifestami.
3. **Tworzenie projektu** (`POST /api/projects` rozszerzony o tryb repo):
   - `mode: "existing"`: owner + repo + gałąź bazowa; zapis bez wykrywania stacku (wykrywanie w etapie 4). Komendy projektu podaje użytkownik w kreatorze, z domyślnymi wartościami dla npm.
   - `mode: "new"`: nazwa, opis, właściciel, widoczność (domyślnie prywatne), szablon. API tworzy repo przez `GitProvider`, a pierwszy commit z plikami szablonu na `main` robi przez Git Data API GitHuba (blob → tree → commit → ref), bez klonowania. Komendy, polityka testów i port podglądu pochodzą z manifestu.
   - To odstępstwo od sekcji 10 (tam pierwszy commit robi worker w sandboxie): jest prostsze, nie wymaga Dockera i nadal wykonuje je platforma, a nie agent. Zapisz je jako punkt do aktualizacji dokumentu.
   - Błąd w połowie (repo utworzone, commit nieudany) zwraca czytelny komunikat, nie zostawia projektu w bazie i nie usuwa repo (adapter nie ma takiej operacji); użytkownik dostaje link do repo.
4. **UI kreatora** (`apps/web`), dostępny z listy projektów:
   - Krok 1: wybór ścieżki A albo B.
   - A: wybór konta i repo z listy (wyszukiwanie), gałąź bazowa, komendy projektu.
   - B: nazwa, opis, właściciel, widoczność, szablon (karty z opisem z manifestu).
   - Podsumowanie i utworzenie; po sukcesie przejście na tablicę tasków projektu.
   - Bez tokenu GitHub kreator kieruje do nowego widoku **Ustawienia → GitHub** (dodanie i usunięcie tokenu, login, data wygaśnięcia, instrukcja wymaganych uprawnień).

**Testy:**

- Tworzenie projektu w obu trybach z zamockowanym GitHubem (msw): poprawna sekwencja wywołań Git Data API, obsługa błędu w połowie.
- Podstawianie placeholderów i pomijanie plików binarnych przy przesyłaniu szablonu.
- Komponentowe testy kreatora (walidacja, oba warianty, brak tokenu).

**Poza zakresem:** klonowanie, worker, sandbox, agent, wykrywanie stacku.

**Kryteria akceptacji:** testy przechodzą; ręcznie w UI tworzysz nowe prywatne repo `aievo-playground` z szablonu React i widzisz na GitHubie pierwszy commit z działającym projektem (sklonuj go lokalnie i uruchom `npm install && npm test`).

Najpierw plan, potem realizacja po mojej akceptacji, w krokach: szablony → API → UI. Na końcu pokaż wyniki komend i zaproponuj wiadomości commitów.
