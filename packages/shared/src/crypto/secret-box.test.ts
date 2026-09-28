import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DecryptionError,
  MasterKeyError,
  createSecretBox,
  keyHint,
  parseMasterKey,
} from './secret-box.js';

const newKey = () => randomBytes(32);

function tamper(stored: string, index: 1 | 2 | 3): string {
  const parts = stored.split(':');
  const bytes = Buffer.from(parts[index]!, 'base64');
  bytes[0] = bytes[0]! ^ 0xff;
  parts[index] = bytes.toString('base64');
  return parts.join(':');
}

describe('createSecretBox', () => {
  it('decrypts what it encrypted', () => {
    const box = createSecretBox(newKey());
    for (const plaintext of ['sk-abc', '', 'zażółć gęślą jaźń 🔑']) {
      expect(box.decrypt(box.encrypt(plaintext))).toBe(plaintext);
    }
  });

  it('stores a versioned value without the plaintext', () => {
    const plaintext = `sk-${randomBytes(16).toString('hex')}`;
    const stored = createSecretBox(newKey()).encrypt(plaintext);

    expect(stored).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(stored).not.toContain(plaintext);
  });

  it('uses a fresh IV for every write', () => {
    const box = createSecretBox(newKey());
    const first = box.encrypt('same');
    const second = box.encrypt('same');

    expect(first.split(':')[1]).not.toBe(second.split(':')[1]);
    expect(first).not.toBe(second);
  });

  it('refuses to decrypt with another master key', () => {
    const stored = createSecretBox(newKey()).encrypt('secret');
    expect(() => createSecretBox(newKey()).decrypt(stored)).toThrow(DecryptionError);
  });

  it.each([1, 2, 3] as const)('detects a modified part %i (iv, tag, ciphertext)', (index) => {
    const box = createSecretBox(newKey());
    const stored = box.encrypt('secret');
    expect(() => box.decrypt(tamper(stored, index))).toThrow(DecryptionError);
  });

  it('rejects unknown versions and malformed values', () => {
    const box = createSecretBox(newKey());
    const [, iv, tag, data] = box.encrypt('secret').split(':');

    for (const stored of [
      `v2:${iv}:${tag}:${data}`,
      'plain-text',
      `v1:${iv}:${tag}`,
      `v1:!!:${tag}:${data}`,
    ]) {
      expect(() => box.decrypt(stored)).toThrow(DecryptionError);
    }
  });

  it('never puts the input into the error message', () => {
    const box = createSecretBox(newKey());
    const stored = box.encrypt('secret');
    try {
      createSecretBox(newKey()).decrypt(stored);
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(stored.split(':')[3]);
    }
  });

  it('rejects a master key of the wrong length', () => {
    expect(() => createSecretBox(randomBytes(16))).toThrow(MasterKeyError);
  });
});

describe('parseMasterKey', () => {
  it('accepts 32 bytes of base64', () => {
    const key = newKey();
    expect(parseMasterKey(key.toString('base64')).equals(key)).toBe(true);
  });

  it.each([
    ['missing', undefined, /not set/],
    ['empty', '  ', /not set/],
    ['31 bytes', randomBytes(31).toString('base64'), /31 bytes instead of 32/],
    ['33 bytes', randomBytes(33).toString('base64'), /33 bytes instead of 32/],
    ['not base64', 'this is not base64!', /not valid base64/],
  ])('rejects a %s key with a readable message', (_label, value, message) => {
    expect(() => parseMasterKey(value)).toThrow(MasterKeyError);
    expect(() => parseMasterKey(value)).toThrow(message);
  });

  it('does not echo the value', () => {
    const value = randomBytes(31).toString('base64');
    expect(() => parseMasterKey(value)).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(value) as string,
      }),
    );
  });
});

describe('keyHint', () => {
  it('returns the last 4 characters of a long key', () => {
    expect(keyHint('sk-ant-0123456789abcd')).toBe('abcd');
  });

  it('hides keys that are too short', () => {
    expect(keyHint('short-key')).toBeNull();
    expect(keyHint('')).toBeNull();
  });
});
