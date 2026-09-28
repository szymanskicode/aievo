# Prompt 4 z 6: rejestr dostawców modeli i szyfrowanie kluczy

Wklej całość do Claude Code w trybie planu (po `/clear`).

---

Przeczytaj `CLAUDE.md` oraz sekcje 9 i 15 w `docs/architecture.md`.

**Zadanie:** bezpieczne przechowywanie kluczy do modeli, rejestr typów dostawców, test połączenia i lista modeli z możliwościami (capabilities).

**Zakres:**

1. **Szyfrowanie** (`apps/api` lub osobny moduł `crypto` w `packages/shared` tylko po stronie serwera): AES-256-GCM, klucz główny z `AIEVO_MASTER_KEY` (32 bajty, base64), losowe IV dla każdego zapisu, format przechowywania z wersją (np. `v1:iv:tag:ciphertext`). Start API kończy się czytelnym błędem, gdy klucz główny jest brakujący lub ma złą długość.
2. **`packages/llm`:**
   - rejestr typów dostawców: `anthropic`, `openai`, `openai-compatible`, każdy z opisem wymaganych pól (klucz, `baseUrl`) i fabryką klienta na Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`);
   - interfejs `LlmClient` zgodny z sekcją 9 (na razie wystarczy implementacja, która obsłuży test połączenia; pełna pętla z narzędziami powstanie w etapie 2);
   - funkcja `listModels(credential)`: pobiera listę modeli od dostawcy, jeśli API to umożliwia, i uzupełnia capabilities tym, co da się ustalić; resztę zostawia do ręcznej edycji.
3. **Endpointy:**
   - `GET /api/provider-types`
   - `GET /api/providers`, `POST /api/providers`, `PATCH /api/providers/:id`, `DELETE /api/providers/:id`
   - `POST /api/providers/:id/test`: sprawdza klucz (lista modeli albo minimalne wywołanie) i zapisuje znalezione modele
   - `GET /api/models`, `PATCH /api/models/:id` (capabilities, ceny, `enabled`)
4. **Zasady bezpieczeństwa:** odpowiedzi API nigdy nie zawierają klucza ani `encryptedKey`, tylko `keyHint`; logi nie zawierają kluczy (redakcja w pino); błędy od dostawcy są mapowane na czytelne komunikaty bez szczegółów żądania.

**Testy:**

- Szyfrowanie: zaszyfruj → odszyfruj, inne IV przy każdym zapisie, błąd przy złym kluczu głównym lub zmodyfikowanym szyfrogramie.
- Endpointy providers: klucz nigdy nie pojawia się w odpowiedzi (test przeszukujący całe ciało odpowiedzi).
- Test połączenia i lista modeli z zamockowanym HTTP dostawców (np. msw); żadnych prawdziwych wywołań sieciowych w testach.

**Poza zakresem:** aliasy modeli, kolejne typy dostawców (etap 5), pętla agenta.

**Kryteria akceptacji:** testy przechodzą; ręcznie da się dodać klucz Anthropic lub adres Ollamy (`openai-compatible`) i zobaczyć listę modeli po teście połączenia.

Najpierw plan (moduły, format szyfrogramu, sposób mockowania dostawców), potem realizacja po mojej akceptacji. Na końcu pokaż wyniki komend i zaproponuj wiadomość commita.
