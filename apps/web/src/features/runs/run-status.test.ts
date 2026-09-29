import { runStatuses } from '@aievo/shared';
import { describe, expect, it } from 'vitest';

import { isOpenRun } from './run-status';

describe('isOpenRun', () => {
  it('is true while a run waits or works, false once it ended', () => {
    expect(runStatuses.filter(isOpenRun)).toEqual(['queued', 'preparing', 'running', 'committing']);
  });
});
