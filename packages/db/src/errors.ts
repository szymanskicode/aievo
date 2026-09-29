/** A write referenced a row that does not exist in the caller's workspace or is otherwise invalid. */
export class InvalidReferenceError extends Error {
  override name = 'InvalidReferenceError';
}

/** A delete was refused because other rows still point at the row (FK `RESTRICT`). */
export class RowInUseError extends Error {
  override name = 'RowInUseError';
}

const FOREIGN_KEY_VIOLATION = '23503';

/** Whether `error` (or the driver error drizzle wraps it around) is an FK violation. */
export function isForeignKeyViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { code?: unknown }).code === FOREIGN_KEY_VIOLATION) return true;
  }
  return false;
}
