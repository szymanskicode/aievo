import { modelCapabilitiesSchema } from '@aievo/shared';
import type { ModelCapabilities } from '@aievo/shared';

/** Full capabilities from what is known; everything else stays off or unknown. */
export function capabilities(known: Partial<ModelCapabilities> = {}): ModelCapabilities {
  return modelCapabilitiesSchema.parse(known);
}

/** A positive integer from loosely typed provider data, or `undefined`. */
export function positiveInt(value: unknown): number | undefined {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isInteger(number) && number > 0 ? number : undefined;
}
