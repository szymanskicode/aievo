/** Prices of a model in USD per million tokens, from `model.priceIn` / `model.priceOut`. */
export interface ModelPricing {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

export interface TokenUsage {
  /** All input tokens, including those read from or written to the prompt cache. */
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * Cost of one call. Cached input tokens are charged at the full input price: the model table
 * has no cache prices yet, and overestimating keeps the cost limit safe. Unknown counts are 0.
 */
export function computeCostUsd(usage: TokenUsage, pricing: ModelPricing): number {
  const input = (usage.inputTokens ?? 0) * pricing.inputUsdPerMTok;
  const output = (usage.outputTokens ?? 0) * pricing.outputUsdPerMTok;
  return (input + output) / 1_000_000;
}
