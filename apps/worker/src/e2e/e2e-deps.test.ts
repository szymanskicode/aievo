import { coderResultSchema } from '@aievo/shared';
import { describe, expect, it } from 'vitest';

import { E2E_FILES, E2E_RESULT, e2eScript } from './e2e-deps.js';

describe('the scripted Programista of the E2E worker', () => {
  it('writes the files it reports and ends with a valid result', () => {
    const script = e2eScript();
    const calls = script.flatMap((response) => response.toolCalls ?? []);

    expect(coderResultSchema.parse(E2E_RESULT)).toEqual(E2E_RESULT);
    expect(calls.at(-1)).toEqual({ name: 'finish', input: E2E_RESULT });
    expect(
      calls
        .filter((call) => call.name === 'write_file')
        .map((call) => (call.input as { path: string }).path),
    ).toEqual([E2E_FILES.source, E2E_FILES.test]);
  });
});
