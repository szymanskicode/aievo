import { describe, expect, it } from 'vitest';

import { expiryState, formatDate } from './format';

describe('expiryState', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  it('distinguishes tokens without expiry, valid, expiring soon and expired', () => {
    expect(expiryState(null, now)).toBe('none');
    expect(expiryState('2026-12-31T00:00:00Z', now)).toBe('valid');
    expect(expiryState('2026-10-10T00:00:00Z', now)).toBe('soon');
    expect(expiryState('2026-09-29T11:59:59Z', now)).toBe('expired');
  });
});

describe('formatDate', () => {
  it('keeps the calendar date of an ISO timestamp', () => {
    expect(formatDate('2026-12-31T00:00:00.000Z')).toBe('2026-12-31');
  });
});
