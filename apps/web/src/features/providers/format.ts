import type { Schemas } from '@aievo/api-client';

/** 200000 → "200k", 1048576 → "1M". */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${Number((count / 1_000_000).toFixed(1))}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`;
  return String(count);
}

/** Only the last characters of a key are ever known to the UI. */
export function describeKey(provider: Pick<Schemas['Provider'], 'hasKey' | 'keyHint'>): string {
  if (!provider.hasKey) return 'No key';
  return provider.keyHint ? `Key ••••${provider.keyHint}` : 'Key saved';
}
