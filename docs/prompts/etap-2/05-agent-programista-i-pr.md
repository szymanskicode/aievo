# Prompt 5 z 7: agent Programista, commit i pull request

Wklej całość do Claude Code w trybie planu (po `/clear`).

---

Przeczytaj `CLAUDE.md` oraz sekcje 7, 10 i 12 w `docs/architecture.md`.

**Zadanie:** pierwszy prawdziwy agent. Run zamiast kroku diagnostycznego uruchamia Programistę, a po jego pracy platforma robi commit, push i otwiera PR.

**Zakres:**

1. **Preset agenta** w `packages/presets/agents/coder/`: `agent.yaml` (klucz, nazwa, narzędzia, uprawnienia, limity, wymagane możliwości modelu: `tools`) i `system-prompt.md`. Prompt ma mówić agentowi m.in.:
   - najpierw poznaj strukturę repo i konwencje (`README`, `docs/CONVENTIONS.md`, `CLAUDE.md`, `AGENTS.md`, jeśli istnieją);
   - realizuj tylko opis i kryteria akceptacji taska, bez zmian „przy okazji”;
   - dopisz testy do nowego kodu i nie zmieniaj istniejących testów (Programista domyślnie może tylko dodawać testy, sekcja 12);
   - przed zakończeniem uruchom lint i testy; jeśli nie przechodzą, popraw albo opisz, czego nie udało się naprawić;
   - zakończ narzędziem `finish` z podsumowaniem zmian, listą zmienionych plików, wynikiem testów i otwartymi kwestiami.
   Wersja agenta w kroku to hash plików presetu.
2. **Wybór modelu:** w ustawieniach workspace'u pole „Model dla Programisty” (lista włączonych modeli z capability `tools` i ustawionym cennikiem). Bez wybranego modelu start runu zwraca czytelny błąd.
3. **Przebieg runu w workerze:** `preparing` (klon, gałąź, sandbox, `install`) → `running` (krok `implement` z Programistą) → `committing` (jeśli są zmiany: commit na hoście z autorem z konfiguracji, np. „AIEvo Programista”, push gałęzi, PR) → `succeeded`. Brak zmian lub błąd agenta → `failed` z opisem, bez PR. Krok diagnostyczny z prompta 3 usuń albo zostaw jako osobny tryb do debugowania.
4. **Opis PR** generowany z danych (nie przez model): tytuł taska, opis i kryteria akceptacji, podsumowanie agenta z `finish`, lista zmienionych plików, wynik testów, liczba iteracji, tokeny i koszt, link do runu w AIEvo. Otwarte kwestie agenta w osobnej sekcji.
5. **Statusy taska:** start runu → `running`; PR otwarty → `in_review`; błąd → `needs_human`. Koszt i tokeny runu sumowane z kroków.
6. **Limity z sekcji 15** dla Programisty: 30 iteracji, koszt runu 5 USD, 60 min (konfigurowalne w projekcie).

**Testy:**

- Przebieg runu end-to-end z `FakeLlmClient` (scenariusz: agent czyta plik, dopisuje funkcję i test, uruchamia testy, woła `finish`), fałszywym sandboxem i gitem na lokalnym bare repo, z zamockowanym tworzeniem PR (msw): sprawdzenie commita, gałęzi, treści PR i statusów.
- Brak zmian → brak PR; błąd agenta → `needs_human`; przekroczenie limitu kosztu → `failed` z informacją o limicie.
- Walidacja presetu agenta (schemat `agent.yaml`, obecność promptu).

**Poza zakresem:** Inspektor, Doktor, pipeline, SSE, UI runów (prompt 6).

**Kryteria akceptacji:** testy przechodzą; ręcznie przez `curl` uruchamiasz run dla prostego taska w `aievo-playground` (np. „Dodaj funkcję `sum(a, b)` w `src/math.ts` z testami”) i na GitHubie powstaje PR z tą zmianą i testami.

Najpierw plan (treść promptu systemowego pokaż w całości do akceptacji), potem realizacja. Na końcu pokaż wyniki komend, link do PR z ręcznego testu i zaproponuj wiadomości commitów.
