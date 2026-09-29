import { describe, expect, it } from 'vitest';

import { OutputTail } from './output-tail.js';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('OutputTail', () => {
  it('keeps short output unchanged', () => {
    const tail = new OutputTail(10);
    tail.push(bytes('one\ntwo\n'));
    tail.push(bytes('three'));

    expect(tail.toString()).toBe('one\ntwo\nthree');
    expect(tail.truncated).toBe(false);
  });

  it('keeps only the last lines and reports the cut', () => {
    const tail = new OutputTail(2);
    for (let i = 1; i <= 5; i += 1) tail.push(bytes(`line ${i}\n`));

    expect(tail.toString()).toBe('line 4\nline 5');
    expect(tail.truncated).toBe(true);
  });

  it('joins lines split across chunks and drops carriage returns', () => {
    const tail = new OutputTail(5);
    tail.push(bytes('hel'));
    tail.push(bytes('lo\r\nwor'));
    tail.push(bytes('ld'));

    expect(tail.toString()).toBe('hello\nworld');
  });

  it('decodes multi-byte characters split across chunks', () => {
    const tail = new OutputTail(5);
    const encoded = bytes('zażółć');
    tail.push(encoded.subarray(0, 3));
    tail.push(encoded.subarray(3));

    expect(tail.toString()).toBe('zażółć');
  });

  it('cuts very long lines', () => {
    const tail = new OutputTail(5);
    tail.push(bytes(`${'x'.repeat(10_000)}\n`));

    expect(tail.toString().length).toBeLessThan(2_100);
    expect(tail.toString()).toContain('[… line cut]');
  });
});
