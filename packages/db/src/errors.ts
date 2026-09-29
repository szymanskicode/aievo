/** A write referenced a row that does not exist in the caller's workspace or is otherwise invalid. */
export class InvalidReferenceError extends Error {
  override name = 'InvalidReferenceError';
}

/** A delete was refused because other rows still point at the row (FK `RESTRICT`). */
export class RowInUseError extends Error {
  override name = 'RowInUseError';
}

/** A write would create a second row where only one is allowed (unique constraint). */
export class DuplicateRowError extends Error {
  override name = 'DuplicateRowError';
}

const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

/** Whether `error` (or the driver error drizzle wraps it around) violates `constraint`. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    const { code, constraint: name } = current as { code?: unknown; constraint?: unknown };
    if (code === UNIQUE_VIOLATION && name === constraint) return true;
  }
  return false;
}

/** Whether `error` (or the driver error drizzle wraps it around) is an FK violation. */
export function isForeignKeyViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { code?: unknown }).code === FOREIGN_KEY_VIOLATION) return true;
  }
  return false;
}
