# Etap 2: pierwszy agent

Cel etapu: jeden agent (Programista), który na prawdziwym repozytorium GitHub realizuje prosty task i otwiera pull request z kodem i testami. To najważniejszy kamień milowy projektu, bo od niego AIEvo zaczyna naprawdę pracować.

**Warunek ukończenia:** w UI tworzysz task w projekcie `aievo-playground`, klikasz „Uruchom agenta”, a na GitHubie powstaje PR, który przeszedłby Twoje review.

## Krok 0: zamknij etap 1

1. Sprawdź, że etap 1 ma commit i tag: `git tag` pokazuje `v0.1.0`. Jeśli nie: `git tag v0.1.0 && git push --tags`.
2. Otwórz `CLAUDE.md` i porównaj sekcję „Aktualny etap” z blokiem niżej. Jeśli prompt 6 z etapu 1 przygotował coś innego, zastąp ją tym blokiem:

   ```markdown
   ## Aktualny etap

   **Etap 2: Pierwszy agent** (roadmapa w sekcji 17 `docs/architecture.md`).
   Cel etapu: token GitHub i kreator projektu (istniejące repo albo nowe z szablonu), worker z kolejką pg-boss, sandbox Docker, pętla agenta z narzędziami, agent Programista, commit, push i PR, podgląd kroków w UI.
   Warunek ukończenia: task utworzony w UI kończy się pull requestem z kodem i testami na GitHubie, a wszystkie testy przechodzą.

   Nie buduj niczego z późniejszych etapów (Inspektor, Doktor, silnik pipeline'u, SSE, Tester, Strażnik, podgląd aplikacji, Studio). Jeśli coś z nich wydaje się potrzebne, zatrzymaj się i zapytaj.
   ```

3. Skopiuj katalog `docs/prompts/etap-2/` z tej paczki do repo i zrób commit.

## Krok 1: przygotuj dostęp (jednorazowo)

**Token GitHub** (sekcja 10 dokumentu architektury):

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Repository access: **All repositories** (potrzebne do tworzenia nowych repo z AIEvo).
3. Permissions → Repository: **Administration: Read and write**, **Contents: Read and write**, **Pull requests: Read and write**, **Metadata: Read-only**.
4. Ustaw datę wygaśnięcia (np. 90 dni) i zapisz token w menedżerze haseł. Do AIEvo wkleisz go w prompcie 2 przez UI (albo w prompcie 1 przez `curl`).

**Klucz do modelu** (dla agenta AIEvo, nie dla Claude Code):

1. Utwórz klucz API u wybranego dostawcy, np. w konsoli Anthropic.
2. **Ustaw limit wydatków na koncie dostawcy** (np. 20 USD miesięcznie). To zabezpieczenie niezależne od limitów w AIEvo, na wypadek błędu w pętli agenta.
3. Dodaj klucz w AIEvo (Ustawienia → Dostawcy modeli), przetestuj połączenie i uzupełnij cennik modelu, którego użyje Programista. Bez cennika AIEvo nie pozwoli uruchomić agenta, bo nie umiałby pilnować kosztu.

**Docker:** Docker Desktop (lub Engine) musi działać. Na Windows pracuj w WSL 2 i trzymaj repo w systemie plików WSL, nie na dysku `C:`.

**Uprawnienia Claude Code:** w `.claude/settings.json` dopisz do listy `allow` komendy, których Claude użyje do sprawdzania Dockera:

```json
"Bash(docker ps:*)",
"Bash(docker images:*)",
"Bash(docker logs:*)"
```

`docker build` i `docker rm` zostaw bez wpisu, żeby Claude pytał o zgodę.

## Krok 2: prompty etapu 2

Rytm pracy jest taki sam jak w etapie 1: `/clear` → tryb planu → wklejasz prompt → akceptujesz plan → realizacja → sam sprawdzasz kryteria → `/review` → commit robisz Ty.

| # | Prompt | Wynik | Jak sprawdzić |
| --- | --- | --- | --- |
| 1 | `01-github-i-model-danych.md` | Tabele runów, token GitHub, adapter Git z białą listą operacji | `curl` z tokenem pokazuje listę Twoich repo |
| 2 | `02-kreator-projektu.md` | Szablony, kreator: istniejące repo albo nowe z szablonu | W UI tworzysz repo `aievo-playground`; po sklonowaniu `npm install && npm test` przechodzi |
| 3 | `03-worker-kolejka-sandbox.md` | Worker, kolejka, sandbox Docker, run bez AI | Run kończy się `succeeded` z wynikiem testów; `docker ps -a` jest czyste |
| 4 | `04-petla-agenta.md` | LlmClient z narzędziami, pętla agenta, limity | Testy z fałszywym modelem przechodzą |
| 5 | `05-agent-programista-i-pr.md` | Agent Programista, commit, push, PR | Prosty task kończy się prawdziwym PR na GitHubie |
| 6 | `06-ui-runow.md` | Przycisk „Uruchom agenta”, widok runu i kroków | Cały scenariusz w przeglądarce |
| 7 | `07-proba-generalna-i-zamkniecie.md` | Próba na 3 taskach, audyt, `CLAUDE.md` na etap 3 | Tag `v0.2.0` |

Prompt 3 i 5 są najważniejsze i najbardziej ryzykowne (Docker, git, pieniądze). Przy nich czytaj plan szczególnie uważnie. W planie prompta 3 upewnij się, że token GitHub nigdy nie trafia do kontenera ani do `.git/config`.

## Na co uważać w tym etapie

- **Koszty.** Od prompta 5 każdy ręczny test to prawdziwe wywołania modelu. Zaczynaj od najmniejszych tasków i patrz na koszt runu w UI. Testy automatyczne nigdy nie wołają prawdziwego modelu (wymóg w promptach).
- **Repo do eksperymentów.** Agenta testuj tylko na `aievo-playground`, nie na repo `aievo`. Rozwijanie AIEvo przez AIEvo zaczyna się pod koniec etapu 3, gdy będą Inspektor, Doktor i skrypty wersjonowania.
- **Pierwsze PR będą słabe.** To normalne. W etapie 2 oceniasz, czy mechanika działa (klon, sandbox, narzędzia, commit, PR). Jakość poprawią Inspektor i Doktor w etapie 3 oraz dopracowany prompt Programisty.
- **Odstępstwa od dokumentu.** Prompty świadomie upraszczają trzy rzeczy: pierwszy commit nowego repo przez API GitHuba zamiast w sandboxie, sieć sandboxa jeszcze bez ograniczeń i odświeżanie widoku runu zamiast SSE. Prompt 7 zbiera je do aktualizacji dokumentu.

## Po etapie 2

Po tagu `v0.2.0` wróć do rozmowy o etapie 3 (Inspektor, Doktor, silnik pipeline'u, SSE, chronione ścieżki i przygotowanie do rozwijania AIEvo przez AIEvo). Przynieś notatki z próby generalnej, bo od nich zależy, na czym skupić prompty Inspektora.
