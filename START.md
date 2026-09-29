# Jak zacząć budowę AIEvo

Instrukcja krok po kroku: od pustego folderu do ukończonego etapu 1 (projekty i taski zapisywane w bazie, rejestr dostawców modeli). Każdy krok ma na końcu sposób sprawdzenia, że się udał.

## Co jest w tej paczce

| Plik | Po co |
| --- | --- |
| `CLAUDE.md` | Krótki kontekst, który Claude Code czyta na początku każdej sesji: cel, stack, zasady, bieżący etap. |
| `docs/architecture.md` | Pełny dokument architektury. Claude Code czyta z niego tylko potrzebne sekcje. |
| `docs/prompts/etap-1/01…06` | Gotowe prompty etapu 1, do wklejania po kolei. |
| `.claude/settings.json` | Uprawnienia: pnpm i docker compose bez pytania, blokada czytania `.env`, commitów i push. |
| `.claude/commands/next-step.md` | Komenda `/next-step`: stan etapu i propozycja następnego kroku. |
| `.claude/commands/review.md` | Komenda `/review`: krytyczny przegląd zmian przed commitem. |
| `.gitignore` | Wyklucza m.in. `node_modules`, buildy i `.env`. |

## Krok 0: przygotuj narzędzia (jednorazowo)

1. **Node.js 24.** Sprawdź: `node -v` pokazuje `v24.x`.
2. **pnpm** przez Corepack: `corepack enable`. Sprawdź: `pnpm -v`.
3. **Docker Desktop** (Windows, macOS) albo Docker Engine z Compose (Linux). Sprawdź: `docker compose version`. Na Windows pracuj w WSL 2, bo to później ułatwi sandboxy.
4. **Git** i konto **GitHub**.
5. **VS Code** z rozszerzeniem **Claude Code** (lub Claude Code w terminalu). Zaloguj się kontem Claude.
6. Na później (etap 2), nie teraz: klucz API do modeli (np. Anthropic) dla samego AIEvo i token GitHub. Klucz AIEvo to coś innego niż logowanie do Claude Code.

## Krok 1: utwórz repozytorium

1. Na GitHubie utwórz **prywatne**, puste repozytorium `aievo` (bez README, bez `.gitignore`).
2. Sklonuj je: `git clone https://github.com/<twoj-login>/aievo.git`, potem `cd aievo`.
3. Skopiuj do niego **całą zawartość tej paczki**, razem z ukrytymi `.claude/` i `.gitignore`.
4. Pierwszy commit:
   ```bash
   git add .
   git commit -m "docs: add architecture, CLAUDE.md and stage 1 prompts"
   git push -u origin main
   ```

**Sprawdzenie:** na GitHubie widać `CLAUDE.md`, `START.md`, `docs/` i `.claude/`.

## Krok 2: pierwsza sesja z Claude Code

1. Otwórz folder `aievo` w VS Code i uruchom Claude Code.
2. **Nie uruchamiaj `/init`.** `CLAUDE.md` jest już przygotowany.
3. Sprawdź, czy Claude „zna” projekt. Wpisz:
   > Streść w 5 punktach, czym jest AIEvo, jaki jest bieżący etap i jakie zasady pracy obowiązują.

**Sprawdzenie:** odpowiedź mówi o etapie 1, Express 5, pnpm, testach do każdego kodu i o tym, że Claude nie robi commitów.

## Krok 3: rytm pracy z każdym promptem

Ten cykl powtarzasz dla promptów 01–06:

1. **Czysty kontekst:** `/clear` (przy pierwszym prompcie niepotrzebne).
2. **Tryb planu:** przełącz Claude Code w tryb planu (Shift+Tab, aż zobaczysz „plan mode”). Wtedy Claude tylko czyta i planuje, niczego nie zmienia.
3. **Wklej prompt** z `docs/prompts/etap-1/0X-….md` (wszystko pod kreską `---`).
4. **Przeczytaj plan.** Dopytaj, jeśli czegoś nie rozumiesz. Każesz poprawić, jeśli plan wychodzi poza zakres. Dopiero potem zaakceptuj.
5. **Realizacja.** Claude pisze kod i uruchamia testy. Odpowiadaj na pytania o zgodę na komendy.
6. **Sprawdź sam:** uruchom w terminalu komendy z sekcji „Kryteria akceptacji” danego prompta i zajrzyj do aplikacji w przeglądarce, jeśli dotyczy.
7. **Przegląd:** wpisz `/review`. Popraw blockery i majory (poproś Claude'a o poprawki).
8. **Commit robisz Ty:** przejrzyj `git diff`, potem `git add .` i `git commit -m "<wiadomość zaproponowana przez Claude'a>"`, na koniec `git push`.

Zasada: nie przechodź do kolejnego prompta, dopóki bieżący nie ma zielonych testów i commita. Jeśli sesja się rozjechała, `git stash` lub `git checkout .` przywraca ostatni dobry stan.

## Krok 4: etap 1, prompt po prompcie

| # | Prompt | Wynik | Jak sprawdzić |
| --- | --- | --- | --- |
| 1 | `01-szkielet-monorepo.md` | Monorepo, pusty API i web, PostgreSQL w Dockerze | `pnpm dev` → `http://127.0.0.1:5173` działa, `/api/health` zwraca `ok` |
| 2 | `02-schemat-bazy.md` | Tabele, migracje, seed | `pnpm db:migrate && pnpm db:seed` dwa razy bez błędów |
| 3 | `03-rest-api.md` | REST API projektów i tasków + OpenAPI | `curl http://127.0.0.1:3001/api/projects` zwraca projekt z seeda |
| 4 | `04-dostawcy-modeli.md` | Szyfrowane klucze, rejestr dostawców, lista modeli | Dodanie klucza przez API; odpowiedź zawiera tylko końcówkę klucza |
| 5 | `05-frontend.md` | UI: projekty, kanban, formularz taska, dostawcy | Scenariusz: projekt → task → przeciągnięcie → odświeżenie |
| 6 | `06-zamkniecie-etapu.md` | Audyt, poprawione README, `CLAUDE.md` na etap 2 | Świeży start według README działa od zera |

Po prompcie 1 (Claude utworzy wtedy `.env.example`) skopiuj go do `.env` i wygeneruj `AIEVO_MASTER_KEY` według instrukcji w pliku. Plik `.env` nie trafia do repo.

Prompt 5 jest największy. Jeśli sesja robi się długa, przerwij po jednym kroku (np. po kanbanie), zrób commit, `/clear` i poproś o kontynuację: „Kontynuuj prompt 5 od kroku formularza taska. Stan: <co jest zrobione>”.

## Krok 5: zakończenie etapu 1

1. Po prompcie 6 i commicie oznacz wersję:
   ```bash
   git tag v0.1.0
   git push --tags
   ```
2. Upewnij się, że `CLAUDE.md` mówi teraz o etapie 2.

**Warunek ukończenia etapu 1:** task utworzony w UI jest zapisany w bazie, dostawcę modeli można dodać i przetestować, a `pnpm test` i `pnpm test:e2e` przechodzą.

## Krok 6: co dalej

- Na początku każdej sesji możesz wpisać `/next-step`, żeby zobaczyć stan etapu i propozycję kolejnego kroku.
- Do etapu 2 (pierwszy agent, sandbox, GitHub, tworzenie repo z szablonu) przygotujemy osobny zestaw promptów. Wtedy przyda się klucz API do modeli i token GitHub (sekcja 10 dokumentu architektury).
- Gdy zmienisz jakąś decyzję, najpierw zaktualizuj sekcję 18 w `docs/architecture.md` (i dokument w Claude), potem kod.

## Gdy coś idzie nie tak

| Objaw | Co zrobić |
| --- | --- |
| Claude wychodzi poza zakres etapu | „Zatrzymaj się. To jest poza etapem 1 według CLAUDE.md. Cofnij te zmiany.” |
| Testy „przechodzą”, bo Claude je osłabił | `/review`, a potem: „Przywróć oryginalne testy i popraw kod, nie testy.” |
| Sesja się zapętla na tym samym błędzie | `/clear`, potem nowa wiadomość z opisem błędu, pełnym komunikatem i tym, co już próbowano. |
| Port zajęty lub baza nie startuje | `docker compose ps`, `docker compose logs db`; w ostateczności `docker compose down -v` (usuwa lokalne dane). |
| Claude prosi o odczyt `.env` | Odmów. Wszystkie zmienne są opisane w `.env.example`. |
