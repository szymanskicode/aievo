---
description: Krytyczny przegląd niezacommitowanych zmian przed commitem
---

Zrób przegląd wszystkich niezacommitowanych zmian (`git status`, `git diff`, `git diff --staged`, nowe pliki), tak jakbyś był wymagającym recenzentem, który nie pisał tego kodu.

Sprawdź:

1. **Zakres**: czy zmiany dotyczą tylko bieżącego zadania i bieżącego etapu z `CLAUDE.md`? Wypisz wszystko, co wykracza poza zakres.
2. **Zasady z `CLAUDE.md`**: testy dla nowego kodu, `workspaceId` w zapytaniach, schematy Zod w `packages/shared`, brak sekretów, format błędów API, nasłuch na 127.0.0.1.
3. **Testy**: czy testy sprawdzają zachowanie (a nie implementację), czy mają sensowne asercje, czy nie ma `skip`/`only`, czy nie zmieniono istniejących testów tylko po to, żeby przeszły.
4. **Poprawność i bezpieczeństwo**: obsługa błędów, przypadki brzegowe, walidacja wejścia, wycieki kluczy do logów lub odpowiedzi.
5. **Czytelność**: nazwy, duplikacja, zbędna złożoność, martwy kod.

Uruchom `pnpm typecheck`, `pnpm lint` i `pnpm test` i podaj wynik.

Odpowiedz listą problemów z wagą (blocker / major / minor), plikiem i linią oraz proponowaną poprawką. Na końcu werdykt: „gotowe do commita” albo „do poprawy”, i propozycja wiadomości commita (Conventional Commits, po angielsku).

Niczego nie poprawiaj bez mojej zgody.

Dodatkowe wskazówki od użytkownika (mogą być puste): $ARGUMENTS
