import { describe, expect, it } from 'vitest';

import { providerTypes } from './enums.js';
import {
  createProviderSchema,
  missingProviderFields,
  providerSchema,
  providerTypeInfo,
  providerTypeInfoList,
  updateProviderSchema,
} from './provider.js';

describe('providerTypeInfo', () => {
  it('describes every provider type', () => {
    expect(providerTypeInfoList.map((info) => info.type)).toEqual([...providerTypes]);
  });

  it('requires a base URL exactly where there is no default', () => {
    for (const info of providerTypeInfoList) {
      expect(info.baseUrl === 'required', info.type).toBe(info.defaultBaseUrl === null);
    }
  });
});

describe('missingProviderFields', () => {
  it('requires a key for hosted providers', () => {
    expect(missingProviderFields('anthropic', { apiKey: false, baseUrl: false })).toEqual([
      'apiKey',
    ]);
    expect(missingProviderFields('openai', { apiKey: true, baseUrl: false })).toEqual([]);
  });

  it('requires only a base URL for OpenAI-compatible servers', () => {
    expect(missingProviderFields('openai-compatible', { apiKey: false, baseUrl: false })).toEqual([
      'baseUrl',
    ]);
    expect(missingProviderFields('openai-compatible', { apiKey: false, baseUrl: true })).toEqual(
      [],
    );
  });
});

describe('createProviderSchema', () => {
  it('accepts an Anthropic key', () => {
    const parsed = createProviderSchema.parse({
      type: 'anthropic',
      label: ' Claude ',
      apiKey: 'sk-ant-xyz',
    });
    expect(parsed).toEqual({ type: 'anthropic', label: 'Claude', apiKey: 'sk-ant-xyz' });
  });

  it('accepts Ollama without a key', () => {
    const result = createProviderSchema.safeParse({
      type: 'openai-compatible',
      label: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
    });
    expect(result.success).toBe(true);
  });

  it('reports the fields that the type requires', () => {
    const anthropic = createProviderSchema.safeParse({ type: 'anthropic', label: 'Claude' });
    const compatible = createProviderSchema.safeParse({
      type: 'openai-compatible',
      label: 'Local',
      baseUrl: null,
    });

    expect(anthropic.error?.issues.map((issue) => issue.path)).toEqual([['apiKey']]);
    expect(compatible.error?.issues.map((issue) => issue.path)).toEqual([['baseUrl']]);
  });

  it('rejects non-HTTP base URLs, unknown types and unknown fields', () => {
    const base = { type: 'openai', label: 'GPT', apiKey: 'sk-x' };
    expect(createProviderSchema.safeParse({ ...base, baseUrl: 'file:///etc/passwd' }).success).toBe(
      false,
    );
    expect(createProviderSchema.safeParse({ ...base, type: 'google' }).success).toBe(false);
    expect(createProviderSchema.safeParse({ ...base, encryptedKey: 'v1:…' }).success).toBe(false);
  });

  it('rejects an empty key', () => {
    expect(
      createProviderSchema.safeParse({ type: 'openai', label: 'GPT', apiKey: '   ' }).success,
    ).toBe(false);
  });
});

describe('updateProviderSchema', () => {
  it('accepts a partial patch and key removal', () => {
    expect(updateProviderSchema.parse({})).toEqual({});
    expect(updateProviderSchema.parse({ apiKey: null })).toEqual({ apiKey: null });
  });

  it('does not allow changing the type', () => {
    expect(updateProviderSchema.safeParse({ type: 'openai' }).success).toBe(false);
  });
});

describe('providerSchema', () => {
  it('has no field that could carry the key', () => {
    const keys = Object.keys(providerSchema.shape);
    expect(keys).not.toContain('apiKey');
    expect(keys).not.toContain('encryptedKey');
    expect(keys).toContain('keyHint');
  });

  it('drops undeclared fields on parse', () => {
    const parsed = providerSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      type: 'anthropic',
      label: 'Claude',
      hasKey: true,
      keyHint: 'abcd',
      baseUrl: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      encryptedKey: 'v1:secret',
    });
    expect(parsed).not.toHaveProperty('encryptedKey');
  });
});

it('keeps the default base URLs of hosted providers', () => {
  expect(providerTypeInfo.anthropic.defaultBaseUrl).toBe('https://api.anthropic.com/v1');
  expect(providerTypeInfo.openai.defaultBaseUrl).toBe('https://api.openai.com/v1');
});
