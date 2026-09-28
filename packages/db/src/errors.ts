/** A write referenced a row that does not exist in the caller's workspace or is otherwise invalid. */
export class InvalidReferenceError extends Error {
  override name = 'InvalidReferenceError';
}
