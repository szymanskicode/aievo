import { describe, expect, it } from 'vitest';

import { DEFAULT_SANDBOX_USER, resolveSandboxUser } from './host-user.js';

describe('resolveSandboxUser', () => {
  it('uses the host user on Linux and macOS', () => {
    expect(resolveSandboxUser(undefined, { uid: 1001, gid: 1002 })).toBe('1001:1002');
  });

  it('falls back to the image user on Windows and for a root worker', () => {
    expect(resolveSandboxUser(undefined, {})).toBe(DEFAULT_SANDBOX_USER);
    expect(resolveSandboxUser(undefined, { uid: 0, gid: 0 })).toBe(DEFAULT_SANDBOX_USER);
  });

  it('prefers an explicit override', () => {
    expect(resolveSandboxUser('2000:2000', { uid: 1001, gid: 1002 })).toBe('2000:2000');
    expect(resolveSandboxUser('', { uid: 1001, gid: 1002 })).toBe('1001:1002');
  });

  it('refuses a malformed override and root', () => {
    expect(() => resolveSandboxUser('sandbox')).toThrow('uid:gid');
    expect(() => resolveSandboxUser('0:0')).toThrow('root');
  });
});
