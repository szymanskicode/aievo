# Prompt 7 z 7: próba generalna i zamknięcie etapu 2

Najpierw wykonaj ręczną próbę generalną (niżej), a dopiero potem wklej prompt do Claude Code (po `/clear`).

## Próba generalna (robisz Ty, w przeglądarce)

Na projekcie `aievo-playground` uruchom agenta dla trzech tasków o rosnącej trudności i po każdym oceń PR tak, jakby przysłał go człowiek:

1. **Mały:** „Dodaj funkcję `formatPrice(value, currency)` w `src/lib/format.ts` zwracającą np. `12,50 zł` dla PLN. Kryteria: testy dla PLN, EUR i wartości 0.”
2. **Średni:** „Dodaj komponent licznika z przyciskami +1, −1 i Reset. Licznik nie schodzi poniżej zera. Kryteria: testy komponentu dla wszystkich przycisków i granicy zera.”
3. **Z pułapką:** task z niejasnym opisem, np. „Popraw wygląd strony głównej”. Sprawdzasz, czy agent przyznaje się do niejasności w otwartych kwestiach, zamiast zgadywać.

Dla każdego zapisz: czy PR spełnia kryteria, czy są testy, czy testy przechodzą po sklonowaniu gałęzi, koszt i czas, co było złe. Zmerguj tylko te PR, które przeszłyby Twoje review.

## Prompt

---

Przeczytaj `CLAUDE.md` oraz sekcje 17 i 18 w `docs/architecture.md`. Kończymy etap 2.

Moje notatki z próby generalnej (3 taski na `aievo-playground`):

<WKLEJ TUTAJ SWOJE NOTATKI: dla każdego taska wynik, koszt, czas i problemy>

**Zadanie:** audyt etapu 2 i przygotowanie do etapu 3.

1. **Checklista etapu:** dla każdego punktu etapu 2 z roadmapy wskaż, gdzie jest w kodzie i jakim testem jest pokryty. Wypisz braki.
2. **Wnioski z próby generalnej:** na podstawie moich notatek zaproponuj konkretne zmiany w `packages/presets/agents/coder/system-prompt.md` i limitach (pokaż jako diff, bez wprowadzania). Oddziel problemy, które rozwiąże dopiero Inspektor i Doktor w etapie 3.
3. **Bezpieczeństwo:** sprawdź, że token GitHub i klucze modeli nie trafiają do kontenera, logów, bazy w postaci jawnej, opisu PR ani commitów (przeszukaj kod i logi z ostatnich runów). Sprawdź blokadę push na gałąź bazową.
4. **Świeży start:** `docker compose down -v` → pełna instalacja według `README.md`, łącznie z `pnpm sandbox:build`, migracjami i seedem → `pnpm test`, `pnpm test:docker`, `pnpm test:e2e`. Popraw README, jeśli czegoś brakuje.
5. **Odstępstwa od dokumentu architektury:** zbierz wszystkie świadome odstępstwa z etapu 2 (m.in. pierwszy commit przez Git Data API, sieć sandboxa jeszcze nieograniczona, odświeżanie zamiast SSE) i przygotuj proponowany tekst do sekcji 10, 11 i 18 `docs/architecture.md`, do mojej akceptacji.
6. **Aktualizacja `CLAUDE.md`:** przygotuj zmianę sekcji „Aktualny etap” na etap 3 (cel i warunek ukończenia z roadmapy) oraz dopisz do stacku nowe biblioteki z etapu 2. Pokaż jako diff do akceptacji.

Odpowiedz raportem w punktach 1–6. Po moich decyzjach wprowadź zaakceptowane zmiany i zaproponuj wiadomość commita. Po commicie oznaczę wersję tagiem `v0.2.0`.
