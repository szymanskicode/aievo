import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Server-only encryption of secrets at rest (provider API keys, later Git tokens).
 * Exposed as `@aievo/shared/crypto` and never re-exported from the package root,
 * so browser bundles cannot pull in `node:crypto`.
 *
 * Stored format: `v1:<iv>:<tag>:<ciphertext>`, each part base64-encoded.
 * AES-256-GCM with a random 12-byte IV per write and a 16-byte auth tag.
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** `AIEVO_MASTER_KEY` is missing or malformed. The message never contains the value. */
export class MasterKeyError extends Error {
  override name = 'MasterKeyError';
}

/** A stored secret cannot be decrypted. The message never contains the input. */
export class DecryptionError extends Error {
  override name = 'DecryptionError';
}

export const MASTER_KEY_HELP =
  'must be 32 random bytes encoded as base64 ' +
  `(generate one with: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))")`;

/** Decodes and checks the master key; throws `MasterKeyError` with a readable reason. */
export function parseMasterKey(value: string | undefined): Buffer {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') {
    throw new MasterKeyError(`AIEVO_MASTER_KEY is not set; it ${MASTER_KEY_HELP}`);
  }
  if (!BASE64.test(trimmed) || trimmed.length % 4 !== 0) {
    throw new MasterKeyError(`AIEVO_MASTER_KEY is not valid base64; it ${MASTER_KEY_HELP}`);
  }
  const key = Buffer.from(trimmed, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new MasterKeyError(
      `AIEVO_MASTER_KEY decodes to ${key.length} bytes instead of ${KEY_BYTES}; it ${MASTER_KEY_HELP}`,
    );
  }
  return key;
}

export interface SecretBox {
  encrypt(plaintext: string): string;
  decrypt(stored: string): string;
}

export function createSecretBox(masterKey: Buffer): SecretBox {
  if (masterKey.length !== KEY_BYTES) {
    throw new MasterKeyError(`Master key must be ${KEY_BYTES} bytes`);
  }
  // Private copy: a caller zeroing or reusing its buffer must not change this box.
  const key = Buffer.from(masterKey);

  return {
    encrypt(plaintext) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv, tag, ciphertext].map(encodePart).join(':');
    },

    decrypt(stored) {
      const parts = stored.split(':');
      if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new DecryptionError('Unsupported secret format');
      }
      const [iv, tag, ciphertext] = parts.slice(1).map(decodePart) as [Buffer, Buffer, Buffer];
      if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
        throw new DecryptionError('Unsupported secret format');
      }
      try {
        const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      } catch {
        // Wrong master key or tampered data; the cause adds nothing and is dropped.
        throw new DecryptionError('Secret cannot be decrypted');
      }
    },
  };
}

function encodePart(part: string | Buffer): string {
  return typeof part === 'string' ? part : part.toString('base64');
}

function decodePart(part: string): Buffer {
  if (!BASE64.test(part)) throw new DecryptionError('Unsupported secret format');
  return Buffer.from(part, 'base64');
}

/** Shortest key for which the last 4 characters may be shown without revealing too much. */
const HINT_MIN_LENGTH = 12;

/** Last 4 characters of a key, shown in the UI; `null` for keys too short to hint safely. */
export function keyHint(key: string): string | null {
  return key.length >= HINT_MIN_LENGTH ? key.slice(-4) : null;
}
