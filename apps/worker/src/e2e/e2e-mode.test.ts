import { describe, expect, it } from 'vitest';

import { assertE2eMode } from './e2e-mode.js';

const TEST_DB = 'postgresql://aievo:aievo@127.0.0.1:5432/aievo_e2e_test';

describe('assertE2eMode', () => {
  it('allows the fakes only with the flag and a test database', () => {
    expect(() => assertE2eMode({ AIEVO_E2E_FAKES: '1' }, TEST_DB)).not.toThrow();
  });

  it('refuses to start without the flag', () => {
    expect(() => assertE2eMode({}, TEST_DB)).toThrow(/AIEVO_E2E_FAKES=1/);
    expect(() => assertE2eMode({ AIEVO_E2E_FAKES: 'true' }, TEST_DB)).toThrow(/AIEVO_E2E_FAKES/);
  });

  it('refuses a database that is not a test database', () => {
    expect(() =>
      assertE2eMode({ AIEVO_E2E_FAKES: '1' }, 'postgresql://aievo:aievo@127.0.0.1:5432/aievo'),
    ).toThrow(/test database/);
    expect(() => assertE2eMode({ AIEVO_E2E_FAKES: '1' }, 'not a url')).toThrow(/DATABASE_URL/);
  });
});
