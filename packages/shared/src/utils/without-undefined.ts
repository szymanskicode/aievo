export type WithoutUndefined<T> = { [K in keyof T]: Exclude<T[K], undefined> };

/**
 * Drops keys whose value is `undefined`. Zod types optional fields as `T | undefined`, while
 * code under `exactOptionalPropertyTypes` (the repositories, the generated API client types)
 * expects them to be absent.
 */
export function withoutUndefined<T extends object>(value: T): WithoutUndefined<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as WithoutUndefined<T>;
}
