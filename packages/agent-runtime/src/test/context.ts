import type { Sandbox } from '@aievo/sandbox';

import type { ToolContext } from '../tools/tool.js';
import { DEFAULT_LIMITS } from '../types.js';

export function toolContext(sandbox: Sandbox, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sandbox,
    permissions: { writeGlobs: ['**'] },
    commands: { allowed: ['npm install', 'npm test', 'npm run lint'] },
    git: { baseRef: 'origin/main' },
    limits: { ...DEFAULT_LIMITS, commandTimeoutMs: 60_000 },
    signal: new AbortController().signal,
    ...overrides,
  };
}

export function execResult(
  output: string,
  exitCode: number | null = 0,
  extra: { truncated?: boolean; timedOut?: boolean } = {},
) {
  return {
    output,
    exitCode,
    timedOut: extra.timedOut ?? false,
    truncated: extra.truncated ?? false,
    durationMs: 5,
  };
}
