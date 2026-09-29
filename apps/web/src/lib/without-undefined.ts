type WithoutUndefined<T> = { [K in keyof T]: Exclude<T[K], undefined> };

/**
 * Drops keys whose value is `undefined`. Zod types optional fields as `T | undefined`,
 * while the generated API types (under `exactOptionalPropertyTypes`) expect them absent.
 * Same helper as in `apps/api/src/http/without-undefined.ts`.
 */
export function withoutUndefined<T extends object>(value: T): WithoutUndefined<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as WithoutUndefined<T>;
}
