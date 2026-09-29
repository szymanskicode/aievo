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

## 4. Sieć sandboxa nie jest ograniczona do rejestrów pakietów (prompt 3)

- **Dokument (sekcja 11):** sieć kontenera domyślnie ograniczona do rejestrów pakietów (npm, PyPI, Maven), dodatkowe domeny w projekcie.
- **Stan faktyczny:** kontener runu działa w domyślnej sieci `bridge` z pełnym dostępem do internetu. Pozostałe zabezpieczenia są włączone: brak tokenu GitHub, kluczy modeli i socketu Dockera w kontenerze, `--cap-drop ALL`, `no-new-privileges`, użytkownik bez roota, limity pamięci, CPU i procesów.
- **Dlaczego:** filtr domen wymaga osobnego proxy (albo reguł sieciowych na hoście), a w etapie 2 liczy się sprawdzona ścieżka runu.
- **Proponowana zmiana:** sekcja 11 („Sieć domyślnie ograniczona…”) z adnotacją, od którego etapu obowiązuje, oraz punkt w sekcji 18.

## 5. Brak limitu rozmiaru dysku kontenera (prompt 3)

- **Dokument (sekcja 11):** limity: CPU, pamięć, czas życia, rozmiar dysku.
- **Stan faktyczny:** limitowane są pamięć (bez swapu), CPU, liczba procesów i czas (komenda i cały run). Rozmiaru dysku nie da się ustawić przenośnie: `--storage-opt size` działa tylko na overlay2 z XFS i `pquota`, a nie działa na Docker Desktop. Katalog roboczy to bind mount z hosta.
- **Proponowana zmiana:** sekcja 11, lista limitów: rozmiar dysku tylko tam, gdzie pozwala sterownik storage.

## 6. Jeden aktywny run na projekt zamiast dwóch (prompt 3)

- **Dokument (sekcja 15):** „Równoległe runy na projekt: 2”.
- **Stan faktyczny:** domyślnie 1 (`AIEVO_MAX_RUNS_PER_PROJECT`), zgodnie z promptem 3. Kolejne runy czekają w kolejce: worker odkłada job o 15 s, dopóki projekt ma wolne miejsce. Limit sprawdza `claimRun` w transakcji z blokadą doradczą na projekt. Dodatkowo task może mieć tylko jeden otwarty run naraz (409 `run_already_active`).
- **Dlaczego:** dwa runy jednego projektu w tym samym repo to więcej konfliktów gałęzi niż zysku, zanim powstanie silnik pipeline'u.
- **Proponowana zmiana:** sekcja 15, tabela limitów: domyślnie 1.

## 7. Sprzątanie przy starcie zakłada jeden proces workera (prompt 3)

- **Stan faktyczny:** przy starcie worker oznacza wszystkie runy `preparing`/`running`/`committing` jako `failed` (`worker_restarted`), usuwa wszystkie kontenery z etykietą `aievo.run` i katalog `<AIEVO_WORKDIR>/runs`. Przy kilku workerach naraz nowy zabiłby runy pozostałych.
- **Proponowana zmiana:** przy skalowaniu workerów (sekcja 3) dodać właściciela runu (id workera i heartbeat) i sprzątać tylko runy bez żywego właściciela.

## 8. `.git` montowany w sandboxie tylko do odczytu (prompt 3)

- **Dokument:** nie opisuje montowania.
- **Stan faktyczny:** katalog roboczy runu jest montowany jako `/workspace` (zapis), a jego `.git` osobno tylko do odczytu. Git na hoście (commit, push) działa z `core.hooksPath` wskazującym pusty katalog, `core.fsmonitor=false`, bez helperów poświadczeń i bez konfiguracji systemowej i użytkownika. Kod z repo nie może więc podsunąć hooka ani konfiguracji, którą worker wykonałby na hoście (sekcja 15: nic z repo nie działa na hoście). Token trafia do gita tylko jako nagłówek HTTP w zmiennych środowiskowych procesu.
- **Proponowana zmiana:** sekcja 11 (reguły kontenera) i sekcja 15 (bezpieczeństwo): dopisać te zasady.

## 9. `AgentRuntime.run` z callbackiem zamiast `AsyncIterable` (prompt 4)

- **Dokument (sekcja 9):** `run(input): AsyncIterable<AgentEvent>` (zdarzenia + końcowy artefakt).
- **Stan faktyczny:** `run({ ..., onEvent }): Promise<AgentOutcome>`. Pętla czeka (`await`) na `onEvent` przy każdym zdarzeniu (`model-response`, `tool-call`, `finish-rejected`), więc worker zapisuje kroki i wywołania narzędzi po kolei, zanim pętla pójdzie dalej. Wynik (`succeeded` z wynikiem `finish`, albo `failed`/`cancelled` z kodem błędu) jest wartością zwracaną, nie ostatnim zdarzeniem. Decyzja użytkownika przy planie prompta 4.
- **Proponowana zmiana:** sekcja 9, szkic interfejsu `AgentRuntime`.

## 10. `run_command` przyjmuje argumenty, `git_diff` pokazuje nowe pliki bez zapisu indeksu (prompt 4)

- **Dokument (sekcja 11, 15):** komenda z listy dozwolonych.
- **Stan faktyczny:** dozwolona komenda (komendy projektu + lista dodatkowa) sama, a przy wpisach z `allowArgs: true` także z dopisanymi argumentami złożonymi tylko ze znaków `[A-Za-z0-9_./=:@%+,-]` i spacji, np. `npm test -- src/math.test.ts`. Komendy, których argumenty zmieniają projekt (np. `install`, bo `npm install <pakiet>` dodaje zależność), podaje się bez `allowArgs`. Cudzysłowy, `;`, `|`, `&`, `$`, przekierowania i nowe linie są odrzucane. `git_diff` działa w sandboxie; ponieważ `.git` jest tylko do odczytu (punkt 8), nowe nieśledzone pliki pokazuje przez `git diff --no-index /dev/null <plik>`.
- **Dodatkowo:** każda ścieżka narzędzia jest sprawdzana po rozwiązaniu dowiązań (`Sandbox.realPath`, `realpath -m` w kontenerze), a zapis do `.git` jest zawsze odrzucany, niezależnie od globów agenta. Globy uprawnień dopasowują też pliki i katalogi zaczynające się od kropki (`**` obejmuje `.gitignore` i `.github/…`). Kontekst projektu w wiadomości z taskiem jest oznaczony jako dane, tak jak wyniki narzędzi.
- **Proponowana zmiana:** sekcja 11, tabela narzędzi i akapit o uprawnieniach.

## 11. Koszt tokenów cache liczony po cenie wejścia (prompt 4)

- **Dokument (sekcja 9):** koszt z `usage` i cennika z bazy.
- **Stan faktyczny:** tabela `model` ma tylko `priceIn`/`priceOut`, więc tokeny odczytu i zapisu cache są liczone po pełnej cenie wejścia (koszt zawyżony, limit bezpieczny). Limit kosztu kroku sprawdzany jest po każdej odpowiedzi modelu, więc jedno wywołanie może go przekroczyć.
- **Proponowana zmiana:** osobne ceny cache w tabeli `model` (sekcja 5/9), gdy zaczniemy używać prompt cachingu.

## 12. Przekroczenie kosztu runu kończy run jako `failed` (prompt 5)

- **Dokument (sekcja 15):** „Koszt na run: 5 USD → run wstrzymany, użytkownik może podnieść limit i wznowić”.
- **Stan faktyczny:** krok `implement` dostaje limit kosztu runu (`project.settings.limits.maxRunCostUsd`, domyślnie 5 USD); po przekroczeniu run kończy się `failed` z kodem `cost_limit` i komunikatem z kwotą i limitem, task → `needs_human`. Wznawiania runów jeszcze nie ma.
- **Proponowana zmiana:** sekcja 15, tabela limitów, z adnotacją, od którego etapu działa wstrzymanie i wznowienie.

## 13. Przekroczenie czasu runu nie zostawia zmian na gałęzi (prompt 5)

- **Dokument (sekcja 15):** „Czas runu: 60 min → run przerwany, zmiany zostają na gałęzi”.
- **Stan faktyczny:** run jest przerywany (`run_timeout`) bez commitu i pusha; katalog roboczy jest usuwany. Limit: `project.settings.limits.maxRunMinutes`, domyślnie `AIEVO_RUN_MAX_MINUTES` (60).
- **Proponowana zmiana:** sekcja 15, gdy powstanie commit po każdym kroku (sekcja 10).

## 14. Jeden commit na run, po kroku Programisty (prompt 5)

- **Dokument (sekcja 10):** commity po każdym kroku zmieniającym pliki, z opisem kroku.
- **Stan faktyczny:** run ma jeden krok zmieniający pliki (`implement`), więc powstaje jeden commit: tytuł taska i stopka `AIEvo-Task`, `AIEvo-Run`, `AIEvo-Agent: coder@<wersja presetu>`. Autor `AIEvo <nazwa agenta>`, e-mail z `AIEVO_GIT_AUTHOR_EMAIL`. Brak zmian → run `failed` (`no_changes`), bez PR.
- **Proponowana zmiana:** bez zmiany dokumentu; do weryfikacji przy silniku pipeline'u (etap 3).

## 15. Platforma sama uruchamia testy po Programiście (prompt 5)

- **Dokument (sekcja 7):** testy uruchamia Inspektor (etap 3).
- **Stan faktyczny:** po kroku `implement` worker robi lokalny commit, a potem uruchamia komendę `test` projektu jako krok `check` (agentKey `platform`). Dzięki tej kolejności pliki zostawione przez testy (raporty, cache) nie trafiają do PR, a run bez zmian kończy się `no_changes` bez uruchamiania testów. Wynik (komenda, status, ogon outputu) trafia do opisu PR obok raportu agenta z `finish`. Czerwone testy nie blokują PR, są w nim oznaczone ❌. Uwaga: ostatnie 60 linii outputu testów jest publikowane w PR (także w publicznym repo); token jest z niego usuwany, ale inne dane wypisywane przez testy repo trafią na GitHuba. Za długi output jest pomijany w opisie PR (zostaje w runie).
- **Proponowana zmiana:** sekcja 8/10: krok weryfikacji platformy przed PR, dopóki nie ma Inspektora.

## 16. Ochrona istniejących testów przez `git cat-file` w sandboxie (prompt 5)

- **Dokument (sekcja 12):** Programista domyślnie nie może zmieniać istniejących testów (tylko dodawać nowe); egzekwuje to narzędzie zapisu.
- **Stan faktyczny:** preset ma `permissions.existingTests: read-only`. `write_file`/`edit_file` odmawiają zapisu pliku pasującego do `testPolicy.testPaths` ∪ `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`, jeśli istnieje on w `origin/<gałąź bazowa>` (sprawdzane `git cat-file -e` w sandboxie). Nowe pliki testów można tworzyć i dalej edytować. Dodatkowe globy są potrzebne, bo domyślne `testPaths` nie łapią np. `App.test.tsx` z szablonu React.
- **Druga linia obrony:** dozwolone komendy z argumentami (np. `npm run lint -- --fix`, `npm test -- -u`) mogą zmienić istniejący test poza narzędziami zapisu. Dlatego po kroku agenta worker sprawdza `git status` na hoście: zmienione lub usunięte pliki testów z bazy są przywracane (`git checkout HEAD -- …`) i wypisane w PR w sekcji „Existing tests restored”.
- **Czysta kopia po instalacji:** pliki śledzone, które przepisała komenda install (np. lockfile innej wersji npm), są przywracane; nowe pliki spoza `.gitignore` przerywają run (`install_changed_files`), żeby nie trafiły do PR jako praca agenta.
- **Proponowana zmiana:** sekcja 12, akapit o zabezpieczeniach.

## 17. Kolejny run tego samego taska używa tej samej gałęzi (prompt 5)

- **Stan faktyczny:** gałąź to `agent/<id taska>-<slug>`. Jeśli istnieje już na GitHubie (np. po udanym runie z PR), push kolejnego runu się nie uda (`push_failed`), bo adapter nigdy nie robi force-push. Poprawki po review jako kolejny run (sekcja 10) wymagają kontynuacji istniejącej gałęzi.
- **Proponowana zmiana:** przy poprawkach po review (etap 3+): run startuje z istniejącej gałęzi taska albo gałąź dostaje sufiks runu.

## 18. Model agenta wybierany w ustawieniach workspace'u (prompt 5)

- **Dokument (sekcje 5, 6):** agent ma `modelRef` (alias z workspace'u), workspace ma „domyślny model per rola”.
- **Stan faktyczny:** `workspace.settings.agentModels.coder` (id modelu), ustawiane przez `PATCH /api/workspace/settings`. Model musi być włączony, mieć capability z `requiredCapabilities` presetu (`tools`) i cennik (inaczej 422 `model_not_usable`). Start runu bez modelu → 409 `agent_model_missing`/`agent_model_unusable`. Aliasów modeli jeszcze nie ma. Preset agenta leży w `packages/presets/agents/coder/` (plik, nie wersjonowany rekord w bazie); wersja w kroku to hash plików presetu.
- **Proponowana zmiana:** sekcja 5/6 przy Studio (etap 5): agenci w bazie, aliasy modeli.

## 19. Wywołania narzędzi stronicowane osobnym endpointem (prompt 6)

- **Dokument (sekcja 13):** `GET /runs/:id/steps` zwraca kroki; o stronicowaniu wywołań narzędzi nie ma mowy.
- **Stan faktyczny:** `GET /api/runs/:id/steps?toolCallLimit=` zwraca kroki z pierwszą stroną wywołań (`toolCalls: { items, nextCursor }`) i ich liczbą (`toolCallCount`). Kolejne strony daje nowy endpoint `GET /api/steps/:id/tool-calls?after=&limit=`. Kursor to id ostatniego wywołania na stronie, a kolejność to `(created_at, id)`, porównywana w SQL, żeby nie tracić mikrosekund. Kursor spoza kroku daje 400 `invalid_reference`. Z `step.output` API zwraca tylko `result` (wynik `finish`), `error { code, message }` i `iterations`.
- **Proponowana zmiana:** sekcja 13, tabela endpointów (dopisać `GET /steps/:id/tool-calls`).

## 20. Task w API zawiera ostatni run (prompt 6)

- **Stan faktyczny:** DTO taska ma pole `latestRun: { id, status, prUrl, prNumber } | null` (najnowszy run taska), zwracane przez listę, szczegóły i `PATCH`. Karta na tablicy pokazuje z niego znacznik pracy agenta i link do PR, bez osobnego zapytania o runy.
- **Proponowana zmiana:** sekcja 13 (opis zasobu task) albo sekcja 5, jeśli dokument ma opisywać kształt odpowiedzi.

## 21. Odświeżanie co 3 s zamiast SSE do etapu 3 (prompt 6)

- **Dokument (sekcja 14):** podgląd runu subskrybuje SSE i nie odpytuje API.
- **Stan faktyczny:** widok runu, lista runów taska i tablica odpytują API co 3 s, ale tylko gdy run jest otwarty (`queued`, `preparing`, `running`, `committing`). Po zakończeniu runu kroki i task są pobierane raz jeszcze. Wyniki narzędzi (do 16 000 znaków każdy) wracają przy każdym odświeżeniu pierwszej strony kroków (domyślnie 100 wywołań w UI).
- **Proponowana zmiana:** brak. SSE z etapu 3 zastępuje odpytywanie zgodnie z dokumentem. Zapis zostaje, żeby w etapie 3 usunąć `refetchInterval`.

## 22. Worker E2E z fałszywym modelem i GitHubem (prompt 6)

- **Stan faktyczny:** `apps/worker/src/e2e/` składa zależności runnera z prawdziwą kolejką, bazą i pętlą agenta oraz ze skryptowanym `FakeLlmClient`, sandboxem na katalogu, lokalnym gitem bez klonowania i GitHubem, który tylko zapisuje PR. Startuje wyłącznie przy `AIEVO_E2E_FAKES=1` i bazie z nazwą kończącą się na `_test`. Nie wchodzi do builda (`tsconfig.build.json`), a Playwright uruchamia go przez `tsx` jako trzeci serwer.
- **Kolejność startu E2E:** Playwright uruchamia serwery przed `globalSetup`, więc baza E2E jest przebudowywana w komendzie serwera API (`e2e/reset-db.ts`), zanim wystartują API i worker. Wcześniejszy `e2e/global-setup.ts` usuwał schemat pg-boss, który serwery już utworzyły.
- **Proponowana zmiana:** sekcja 12 (testy E2E): opis trybu testowego workera.
