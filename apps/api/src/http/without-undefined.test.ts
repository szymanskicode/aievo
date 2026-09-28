import { describe, expect, it } from 'vitest';

import { withoutUndefined } from './without-undefined.js';

describe('withoutUndefined', () => {
  it('drops undefined values but keeps null and falsy ones', () => {
    expect(withoutUndefined({ a: undefined, b: null, c: 0, d: '', e: false })).toEqual({
      b: null,
      c: 0,
      d: '',
      e: false,
    });
  });
});
