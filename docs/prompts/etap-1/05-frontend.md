# Prompt 5 z 6: frontend — projekty, kanban tasków, dostawcy

Wklej całość do Claude Code w trybie planu (po `/clear`).

---

Przeczytaj `CLAUDE.md` oraz sekcje 4 i 14 w `docs/architecture.md`.

**Zadanie:** pierwsza używalna wersja UI w `apps/web`, korzystająca z typowanego klienta API.

**Zakres:**

1. **`packages/api-client`:** typy generowane z `apps/api/openapi.json` (openapi-typescript) i cienki klient (np. openapi-fetch). Skrypt `pnpm api-client:generate`; typecheck frontendu nie przejdzie, jeśli klient jest nieaktualny względem API.
2. **Fundament UI:** Tailwind CSS, shadcn/ui, TanStack Router (trasy typowane), TanStack Query (klient z sensownymi domyślnymi ustawieniami), layout z bocznym menu: Projekty, Ustawienia.
3. **Widoki:**
   - **Lista projektów:** karty projektów, tworzenie projektu w oknie dialogowym (nazwa, opis, opcjonalny URL repo), usuwanie z potwierdzeniem.
   - **Tablica tasków projektu (kanban):** kolumny według statusu, przeciąganie między kolumnami i w obrębie kolumny (np. dnd-kit) z zapisem `status` i `position`, optymistyczna aktualizacja z wycofaniem przy błędzie.
   - **Formularz taska** (tworzenie i edycja w panelu bocznym): tytuł, opis, typ, priorytet, kryteria akceptacji, etykiety. React Hook Form + te same schematy Zod co API.
   - **Ustawienia → Dostawcy modeli:** lista dostawców (tylko `keyHint`), dodawanie według typu z rejestru, przycisk „Testuj połączenie”, lista modeli z capabilities i przełącznikiem `enabled`.
4. Stany ładowania, pustej listy i błędów w każdym widoku; komunikaty błędów z formatu API.

**Testy:**

- Komponentowe (Vitest + Testing Library + msw): formularz taska (walidacja, wysyłka), tablica (renderowanie kolumn, zmiana statusu), formularz dostawcy (klucz nie jest nigdzie wyświetlany po zapisie).
- E2E (Playwright, `pnpm test:e2e`) na prawdziwym API i bazie testowej: utwórz projekt → dodaj task → przeciągnij do innej kolumny → odśwież stronę → task jest w nowej kolumnie.

**Poza zakresem:** Studio agentów, podgląd runów, SSE, kreator z GitHubem (etap 2).

**Kryteria akceptacji:** `pnpm typecheck`, `pnpm lint`, `pnpm test` i `pnpm test:e2e` przechodzą; ręcznie da się przejść cały scenariusz z testu E2E w przeglądarce.

Najpierw plan (struktura tras i katalogów, lista komponentów shadcn, strategia testów), potem realizacja po mojej akceptacji. Pracuj w mniejszych krokach: fundament → projekty → kanban → formularz taska → dostawcy, z testami na każdym kroku. Na końcu pokaż wyniki komend i zaproponuj wiadomość commita (albo kilka, po jednym na krok).
