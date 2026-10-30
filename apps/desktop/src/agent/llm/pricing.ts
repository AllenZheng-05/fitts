// The price table (SPEC-phase2 §11), verified Oct 28. Every cost Fitts shows is an estimate
// from this table; Done says to compare with the Meta dashboard.

export const PRICE_TABLE = '2026-10-28';

/** USD per million tokens. */
export interface TokenPrice {
  in: number;
  cached: number;
  out: number;
}

export const TOKEN_PRICES: Record<string, TokenPrice> = {
  'muse-spark-1.3': { in: 1.25, cached: 0.15, out: 4.25 },
  'muse-spark-1.3-contributor': { in: 0.1, cached: 0.002, out: 0.2 },
  'muse-wonder-1.0': { in: 4, cached: 0.2, out: 20 },
  'meta-models/muse-spark-open-1026': { in: 1.25, cached: 1.25, out: 4.25 },
};

export const IMAGE_USD = 0.01;
export const SAM_USD_PER_IMAGE = 2.5 / 1000;
export const TRANSCRIBE_USD_PER_HOUR = 0.18;
/** ElevenLabs is estimated from characters (Creator-plan rate). */
export const TTS_USD_PER_CHAR = 0.00011;

export function tokenUsd(
  model: string,
  { input, cached, output }: { input: number; cached: number; output: number },
): number {
  const p = TOKEN_PRICES[model];
  if (!p) return 0;
  const fresh = Math.max(0, input - cached);
  return (fresh * p.in + cached * p.cached + output * p.out) / 1e6;
}
