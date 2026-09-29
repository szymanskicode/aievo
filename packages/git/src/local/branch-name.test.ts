import { describe, expect, it } from 'vitest';

import { agentBranchName, isValidAgentBranch, slugify } from './branch-name.js';

describe('slugify', () => {
  it('turns a title into lowercase ASCII words', () => {
    expect(slugify('Fix the Login form!')).toBe('fix-the-login-form');
  });

  it('transliterates Polish letters', () => {
    expect(slugify('Żółta łódź: źle się ładuje')).toBe('zolta-lodz-zle-sie-laduje');
  });

  it('caps the length without a trailing dash', () => {
    const slug = slugify('word '.repeat(30));
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('falls back to "task" when nothing is left', () => {
    expect(slugify('!!! 🚀 ???')).toBe('task');
  });
});

describe('agentBranchName', () => {
  it('uses the first 8 characters of the task id and the slug', () => {
    expect(agentBranchName('0D0C1F7A-3E5B-4A44-8F3A-2C6D9E1B7A11', 'Dodaj logowanie')).toBe(
      'agent/0d0c1f7a-dodaj-logowanie',
    );
  });

  it('always yields a valid agent branch', () => {
    expect(isValidAgentBranch(agentBranchName('abc', '../../main.lock'))).toBe(true);
  });
});

describe('isValidAgentBranch', () => {
  it.each(['agent/abc-fix', 'agent/nested/name', 'agent/v1.2'])('accepts %s', (name) => {
    expect(isValidAgentBranch(name)).toBe(true);
  });

  it.each([
    'main',
    'agents/x',
    'agent/',
    'agent/../main',
    'agent/x.lock',
    'agent/.hidden',
    'agent//x',
    'agent/with space',
    'agent/x:y',
    '+agent/x',
    `agent/${'x'.repeat(200)}`,
  ])('rejects %s', (name) => {
    expect(isValidAgentBranch(name)).toBe(false);
  });
});
