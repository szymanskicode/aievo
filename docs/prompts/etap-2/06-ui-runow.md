# Prompt 6 z 7: UI runów i kroków agenta

Wklej całość do Claude Code w trybie planu (po `/clear`).

---

Przeczytaj `CLAUDE.md` oraz sekcję 14 w `docs/architecture.md`.

**Zadanie:** uruchamianie i śledzenie pracy agenta z poziomu UI. Na żywo przez SSE będzie w etapie 3; teraz wystarczy odświeżanie co kilka sekund, tylko gdy run jest aktywny.

**Zakres:**

1. **API:** `GET /api/runs/:id/steps` (kroki z wywołaniami narzędzi, z paginacją `tool_call`). Zaktualizuj OpenAPI i `packages/api-client`.
2. **Szczegóły taska** (panel lub strona): przycisk „Uruchom agenta” (nieaktywny z wyjaśnieniem, gdy brakuje tokenu GitHub, modelu dla Programisty albo repo w projekcie), lista runów z statusem, czasem, kosztem i linkiem do PR.
3. **Widok runu:** nagłówek (status, gałąź, PR, koszt, tokeny, czas), przycisk „Przerwij” dla aktywnego runu, oś kroków, a w kroku lista wywołań narzędzi: nazwa, skrócone argumenty, rozwijany wynik, czas, błąd wyróżniony. Podsumowanie z `finish` na końcu. Błąd runu czytelnie na górze.
4. **Karta taska na tablicy:** znacznik aktywnego runu i link do PR.
5. **Ustawienia → Modele:** wybór „Modelu dla Programisty” (prompt 5), jeśli jeszcze go nie ma w UI.

**Testy:**

- Komponentowe (msw): przycisk startu w różnych stanach braków, widok runu dla statusów `running`, `succeeded`, `failed`, `cancelled`, rozwijanie wyniku narzędzia.
- E2E (Playwright) z workerem używającym `FakeLlmClient` i fałszywego GitHuba (tryb testowy włączany zmienną środowiskową, niedostępny w zwykłym uruchomieniu): utwórz task → uruchom agenta → widok runu pokazuje kroki → status `succeeded` z linkiem do PR.

**Poza zakresem:** SSE, diff w Monaco, przycisk podglądu, Inspektor i Doktor.

**Kryteria akceptacji:** testy (w tym `pnpm test:e2e`) przechodzą; ręcznie w przeglądarce uruchamiasz agenta dla taska w `aievo-playground`, śledzisz kroki i otwierasz powstały PR.

Najpierw plan, potem realizacja po mojej akceptacji. Na końcu pokaż wyniki komend i zaproponuj wiadomości commitów.
