import { describe, expect, it } from 'vitest';

import { setupStatusSchema } from './setup.js';

describe('setupStatusSchema', () => {
  it('requires every step', () => {
    expect(
      setupStatusSchema.parse({ modelProvider: true, githubToken: false, project: false }),
    ).toEqual({ modelProvider: true, githubToken: false, project: false });
    expect(setupStatusSchema.safeParse({ modelProvider: true }).success).toBe(false);
  });
});
