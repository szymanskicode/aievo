import type { FieldError } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { arrayFieldError } from './array-field-error';

const itemError = (message: string): FieldError => ({ type: 'too_big', message });

describe('arrayFieldError', () => {
  it('returns nothing without an error', () => {
    expect(arrayFieldError(undefined)).toBeUndefined();
  });

  it('prefers the error of the whole array', () => {
    expect(arrayFieldError({ type: 'too_big', message: 'At most 50 allowed' })).toBe(
      'At most 50 allowed',
    );
  });

  it('falls back to the first item with an error', () => {
    // React Hook Form stores item errors in a sparse array, at the index of the item.
    // Its type (`Merge<FieldError, ...>`) describes both shapes at once, hence the cast.
    const errors = [
      undefined,
      itemError('Must be at most 50 characters'),
      itemError('Other'),
    ] as unknown as Parameters<typeof arrayFieldError>[0];

    expect(arrayFieldError(errors)).toBe('Must be at most 50 characters');
  });
});
