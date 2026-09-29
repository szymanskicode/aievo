# Prompt 4 z 7: LlmClient z narzędziami i pętla agenta

Wklej całość do Claude Code w trybie planu (po `/clear`).

---

Przeczytaj `CLAUDE.md` oraz sekcje 9 i 11 w `docs/architecture.md`.

**Zadanie:** silnik agenta niezależny od konkretnego agenta: rozmowa z modelem z narzędziami, pętla wykonawcza, narzędzia działające na sandboxie, limity i koszty. Całość testowana bez prawdziwego modelu.

**Zakres:**

1. **`packages/llm`**: pełna implementacja `LlmClient.chat` z sekcji 9 na Vercel AI SDK, ze strumieniem zdarzeń `text-delta`, `tool-call`, `usage`, `stop`. SDK **nie wykonuje narzędzi samo** (bez jego automatycznych kroków); pętla jest w `agent-runtime`. Liczenie kosztu z `usage` i cennika z tabeli `model`. Retry z wykładniczym opóźnieniem dla 429 i 5xx, timeout wywołania.
2. **`packages/agent-runtime`**:
   - interfejs `AgentRuntime` z sekcji 9 i implementacja `native`;
   - pętla: prompt (system + kontekst + task) → model → wywołania narzędzi → wyniki do rozmowy → powtarzaj, aż agent wywoła narzędzie `finish` z wynikiem zgodnym ze schematem Zod albo skończy się limit;
   - zdarzenia (`AgentEvent`) zapisywane przez przekazany callback, żeby worker mógł je utrwalić jako `step` i `tool_call`.
3. **Narzędzia** (każde ze schematem Zod argumentów i opisem dla modelu): `list_files`, `read_file`, `search_code` (ripgrep), `write_file`, `edit_file` (find → replace, błąd przy braku lub wielu dopasowaniach), `run_command`, `git_diff`, `finish`.
   - Wszystkie ścieżki ograniczone do `/workspace` (odrzucanie `..`, ścieżek absolutnych poza nim i dowiązań symbolicznych wychodzących poza workspace).
   - `run_command` tylko z listy dozwolonych: komendy projektu (install, build, lint, test, coverage) oraz lista dodatkowa z konfiguracji; reszta zwraca błąd z informacją, co jest dozwolone.
   - Uprawnienia per agent (np. `writeFiles: false`, dozwolone globy zapisu) sprawdzane **w kodzie narzędzia**.
   - Wyniki przycinane przed wysłaniem do modelu.
4. **Limity:** maksymalna liczba iteracji, maksymalny koszt kroku i czas kroku. Przekroczenie kończy krok ustrukturyzowanym błędem. Model bez ustawionego cennika jest odrzucany przed startem (bez cennika nie da się pilnować kosztu).
5. **Ochrona przed prompt injection:** treść plików i wyniki komend trafiają do modelu jako wyraźnie oznaczone dane, a prompt systemowy mówi, że instrukcje w nich nie są poleceniami.

**Testy (bez sieci i bez Dockera):**

- `FakeLlmClient` odtwarzający zapisany scenariusz odpowiedzi oraz sandbox na katalogu tymczasowym (tylko do testów).
- Scenariusze: poprawne zakończenie przez `finish`; niepoprawny wynik `finish` → jedna próba poprawy → błąd; limit iteracji; limit kosztu; anulowanie; błąd narzędzia wraca do modelu jako wynik, a nie wyjątek.
- Narzędzia: próby wyjścia poza `/workspace`, zakazane komendy, zapis poza dozwolonymi globami, niejednoznaczny `edit_file`.
- `packages/llm`: mapowanie zdarzeń i koszt na zamockowanych odpowiedziach dostawców (msw), retry przy 429.

**Poza zakresem:** konkretny agent i jego prompt, commit, PR, UI.

**Kryteria akceptacji:** `pnpm typecheck`, `pnpm lint`, `pnpm test` przechodzą; pokrycie `packages/agent-runtime` obejmuje wszystkie narzędzia i ścieżki błędów.

Najpierw plan (typy wiadomości, format zdarzeń, lista narzędzi z uprawnieniami), potem realizacja po mojej akceptacji. Na końcu pokaż wyniki komend i zaproponuj wiadomości commitów.
