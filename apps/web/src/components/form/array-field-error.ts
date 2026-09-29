import type { FieldError, Merge } from 'react-hook-form';

/**
 * The message to show for an array field: an error of the whole array (e.g. too many items)
 * or, failing that, the first error of one of its items.
 */
export function arrayFieldError(
  error: Merge<FieldError, (FieldError | undefined)[]> | undefined,
): string | undefined {
  if (!error) return undefined;
  if (error.message) return error.message;
  if (Array.isArray(error)) {
    const items: (FieldError | undefined)[] = error;
    return items.find((item) => item?.message)?.message;
  }
  return undefined;
}
