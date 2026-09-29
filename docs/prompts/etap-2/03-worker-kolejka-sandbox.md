# Prompt 3 z 7: worker, kolejka i sandbox (bez AI)

Wklej całość do Claude Code w trybie planu (po `/clear`).

---

Przeczytaj `CLAUDE.md` oraz sekcje 3, 10, 11 i 15 w `docs/architecture.md`.

**Zadanie:** cała infrastruktura runu, ale jeszcze bez modelu AI. Run klonuje repo, tworzy gałąź, stawia sandbox, instaluje zależności, uruchamia testy projektu i zapisuje wynik jako krok. Dzięki temu w prompcie 5 dołożymy agenta do sprawdzonej ścieżki.

**Zakres:**

1. **`packages/queue`** na pg-boss (aktualna wersja): kolejka `run`, funkcje `enqueueRun(runId)` i `startRunWorker(handler)`. Zdarzenia statusu na razie tylko jako zapis w bazie (SSE w etapie 3).
2. **`apps/worker`**: osobny proces Node uruchamiany na hoście (`pnpm dev` uruchamia api, web i worker). Przy starcie: sprzątanie osieroconych runów (status `preparing`/`running` → `failed` z opisem) i osieroconych kontenerów z etykietą `aievo.run`. Obsługa SIGTERM.
3. **Operacje git na hoście** (rozszerzenie `packages/git`, część „lokalna”): klon do katalogu roboczego runu (`AIEVO_WORKDIR`, domyślnie katalog w danych aplikacji), utworzenie gałęzi `agent/<krótkie-id-taska>-<slug>`, commit, push gałęzi agenta. Token przekazywany jednorazowo (np. nagłówek HTTP przez zmienną środowiskową procesu git), **nigdy** zapisany w `.git/config`, w URL remote ani w logach. Push na gałąź bazową i force-push są zablokowane w kodzie adaptera.
4. **`packages/sandbox`** (dockerode) z interfejsem `Sandbox` (`exec(cmd, opts)`, `readFile`, `writeFile`, `listFiles`, `stop`) i implementacją Docker:
   - obraz `docker/sandbox-images/node/Dockerfile`: Node 22, git, ripgrep, użytkownik bez roota; skrypt `pnpm sandbox:build`;
   - katalog roboczy runu montowany jako `/workspace`; UID/GID kontenera zgodne z użytkownikiem hosta, żeby pliki dało się potem zacommitować;
   - `--cap-drop ALL`, `no-new-privileges`, limity pamięci, CPU i liczby procesów z konfiguracji, etykieta `aievo.run=<id>`;
   - **w kontenerze nie ma tokenu GitHub, kluczy do modeli ani socketu Dockera**;
   - `exec` z timeoutem, przycinaniem wyjścia (ostatnie N linii) i kodem wyjścia.
   - Ograniczenie sieci do rejestrów pakietów jest odłożone (sekcja 11 zakłada je docelowo). W tym etapie sieć jest włączona; dodaj to jako świadome odstępstwo do listy na koniec etapu.
5. **Run „diagnostyczny”** (tymczasowy przebieg bez AI): `POST /api/tasks/:id/runs` tworzy run i job; worker: `preparing` (klon, gałąź, kontener, komenda `install`) → `running` (jeden krok `stepKey: "check"`, który uruchamia komendę `test` i zapisuje wynik jako `tool_call`) → `succeeded` albo `failed`; na końcu zatrzymanie kontenera i usunięcie katalogu roboczego. Bez commita i PR.
6. **`POST /api/runs/:id/cancel`**: przerwanie przez `AbortSignal`, zatrzymanie kontenera, status `cancelled`. `GET /api/runs/:id` i `GET /api/tasks/:id/runs`.
7. **Limity z sekcji 15** na poziomie runu: maksymalny czas runu i jeden run naraz na projekt (kolejne czekają w kolejce).

**Testy:**

- Jednostkowe przebiegu runu z fałszywym sandboxem i fałszywym gitem (maszyna stanów, błędy na każdym etapie, anulowanie, sprzątanie).
- Adapter git: token nie trafia do `.git/config` ani do remote URL (test na prawdziwym lokalnym repo z bare remote); blokada push na gałąź bazową.
- Integracyjne z prawdziwym Dockerem w osobnym skrypcie `pnpm test:docker`: start kontenera, `exec`, timeout, uprawnienia bez roota, brak zmiennych z sekretami w środowisku kontenera, sprzątanie po etykiecie.

**Poza zakresem:** model AI, agent, narzędzia agenta, commit i PR, SSE, UI (prompt 6).

**Kryteria akceptacji:** `pnpm test` i `pnpm test:docker` przechodzą; ręcznie przez `curl` uruchamiasz run dla taska w `aievo-playground` i widzisz w bazie run `succeeded` z wynikiem testów; `docker ps -a` nie pokazuje pozostawionych kontenerów.

Najpierw plan (szczególnie: przekazanie tokenu do git, UID/GID, sprzątanie), potem realizacja po mojej akceptacji, w krokach: kolejka → git lokalny → sandbox → przebieg runu. Na końcu pokaż wyniki komend i zaproponuj wiadomości commitów.
