import { describe, expect, it } from 'vitest';

import { createDemuxer } from './demux.js';
import type { StreamKind } from './demux.js';

function frame(kind: 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text);
  const header = Buffer.alloc(8);
  header[0] = kind;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

describe('createDemuxer', () => {
  it('splits frames into stdout and stderr, even when chunks cut them apart', () => {
    const seen: [StreamKind, string][] = [];
    const push = createDemuxer((kind, data) => seen.push([kind, Buffer.from(data).toString()]));
    const all = Buffer.concat([frame(1, 'out'), frame(2, 'err'), frame(1, 'more')]);

    push(all.subarray(0, 5));
    push(all.subarray(5, 14));
    push(all.subarray(14));

    expect(seen).toEqual([
      ['stdout', 'out'],
      ['stderr', 'err'],
      ['stdout', 'more'],
    ]);
  });

  it('handles empty frames', () => {
    const seen: string[] = [];
    const push = createDemuxer((_kind, data) => seen.push(Buffer.from(data).toString()));

    push(Buffer.concat([frame(1, ''), frame(1, 'x')]));

    expect(seen).toEqual(['', 'x']);
  });
});
