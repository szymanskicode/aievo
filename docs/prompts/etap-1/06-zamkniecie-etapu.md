# Prompt 6 z 6: zamknięcie etapu 1

Wklej całość do Claude Code (po `/clear`). Tryb planu nie jest potrzebny.

---

Przeczytaj `CLAUDE.md` oraz sekcję 17 w `docs/architecture.md`. Kończymy etap 1.

**Zadanie:** audyt etapu 1 i przygotowanie repo do etapu 2.

1. **Checklista etapu:** dla każdego punktu etapu 1 z roadmapy wskaż, gdzie w kodzie jest zrealizowany i jakim testem jest pokryty. Wypisz braki.
2. **Świeży start:** zasymuluj pierwsze uruchomienie przez nową osobę według `README.md`: `docker compose down -v`, `docker compose up -d`, `pnpm install`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm build`, `pnpm test`, `pnpm test:e2e`. Popraw README, jeśli któryś krok jest nieopisany albo nie działa.
3. **Pokrycie testami:** uruchom pokrycie dla całego repo i pokaż wynik per pakiet. Wskaż miejsca z logiką bez testów (bez dopisywania testów „pod procent”).
4. **Porządki:** nieużywane zależności, martwy kod, TODO bez opisu, niespójne nazwy. Zaproponuj listę, nie usuwaj niczego bez mojej zgody.
5. **Aktualizacja `CLAUDE.md`:** przygotuj zmianę sekcji „Aktualny etap” na etap 2 (cel i warunek ukończenia z roadmapy) i pokaż ją jako diff do akceptacji.

Odpowiedz raportem w punktach 1–5. Po moich decyzjach wprowadź zaakceptowane poprawki i zaproponuj wiadomość commita. Po commicie oznaczę wersję tagiem `v0.1.0`.
