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
