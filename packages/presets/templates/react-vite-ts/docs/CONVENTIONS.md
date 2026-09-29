# Conventions

Short rules for everyone who changes this repository, including AI agents.

## Code

- TypeScript in strict mode; no `any`. Use `import type` for types.
- React function components; one component per file named `PascalCase.tsx`, other files `kebab-case.ts`.
- Keep components small; move logic that is not about rendering into plain functions in `src/`.
- No new dependency without a reason written in the pull request.

## Tests

- Every change of behaviour comes with tests in the same pull request.
- Tests live next to the code as `*.test.ts` / `*.test.tsx` and use Vitest with Testing Library.
- Query the DOM by role and accessible name, the way a user finds things.
- Changed lines need at least 80% line coverage (`npm run test:coverage`).
- Never delete or weaken a test just to make it pass; explain why it is outdated instead.

## Before opening a pull request

Run `npm run lint`, `npm test` and `npm run build`; all of them must pass.
