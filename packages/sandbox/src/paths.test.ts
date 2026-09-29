import { describe, expect, it } from 'vitest';

import { SandboxError } from './errors.js';
import { resolveWorkspacePath, toWorkspaceRelative } from './paths.js';

describe('resolveWorkspacePath', () => {
  it.each([
    ['.', '/workspace'],
    ['src/app.ts', '/workspace/src/app.ts'],
    ['/workspace/src', '/workspace/src'],
    ['src/../README.md', '/workspace/README.md'],
    ['src\\win\\path.ts', '/workspace/src/win/path.ts'],
  ])('resolves %s', (input, expected) => {
    expect(resolveWorkspacePath(input)).toBe(expected);
  });

  it.each(['..', '../etc/passwd', '/etc/passwd', '/workspace-other/x', 'a\0b', '/'])(
    'refuses %s',
    (input) => {
      expect(() => resolveWorkspacePath(input)).toThrow(SandboxError);
    },
  );
});

describe('toWorkspaceRelative', () => {
  it('strips the workspace prefix', () => {
    expect(toWorkspaceRelative('/workspace/src/a.ts')).toBe('src/a.ts');
    expect(toWorkspaceRelative('src/a.ts')).toBe('src/a.ts');
  });
});
