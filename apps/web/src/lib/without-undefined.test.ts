import { describe, expect, it } from 'vitest';

import { withoutUndefined } from './without-undefined';

describe('withoutUndefined', () => {
  it('drops undefined values and keeps null, empty strings and false', () => {
    expect(withoutUndefined({ a: undefined, b: null, c: '', d: false })).toEqual({
      b: null,
      c: '',
      d: false,
    });
  });
});
