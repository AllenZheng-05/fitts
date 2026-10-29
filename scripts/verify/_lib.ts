// Shared helpers for the Phase 2 day-1 verification scripts (SPEC-phase2 §0.1).
// Keys come from .env.local through dotenv and are never printed; only their presence is.
import { config } from 'dotenv';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
config({ path: join(ROOT, '.env.local'), quiet: true });

export type KeyName = 'META_API_KEY' | 'BASETEN_API_KEY' | 'ELEVENLABS_API_KEY';

export function key(name: KeyName): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

export const META_BASE_URL = 'https://api.meta.ai/v1';

/** Session spend cap for development (FITTS_DEV_SPEND_CAP_USD, default $25). */
export const CAP_USD = Number(process.env['FITTS_DEV_SPEND_CAP_USD'] ?? '25') || 25;

const SPEND_FILE = join(ROOT, '.fitts-dev', 'spend.json');

interface SpendFile {
  totalUsd: number;
  entries: { ts: string; source: string; usd: number; note: string }[];
}

export function readSpend(): SpendFile {
  try {
    return JSON.parse(readFileSync(SPEND_FILE, 'utf8')) as SpendFile;
  } catch {
    return { totalUsd: 0, entries: [] };
  }
}

export function recordSpend(source: string, usd: number, note: string): void {
  const s = readSpend();
  s.totalUsd = Math.round((s.totalUsd + usd) * 1e6) / 1e6;
  s.entries.push({ ts: new Date().toISOString(), source, usd, note });
  mkdirSync(dirname(SPEND_FILE), { recursive: true });
  writeFileSync(SPEND_FILE, JSON.stringify(s, null, 2));
}

/** Refuses a live call whose estimate would cross the session cap. */
export function canSpend(estimateUsd: number): boolean {
  const { totalUsd } = readSpend();
  if (totalUsd + estimateUsd > CAP_USD) {
    log(
      `SKIP: estimate $${estimateUsd.toFixed(3)} would cross the $${CAP_USD} cap (spent $${totalUsd.toFixed(3)})`,
    );
    return false;
  }
  return true;
}

/** USD per million tokens (SPEC-phase2 §11). */
export const PRICES: Record<string, { in: number; cached: number; out: number }> = {
  'muse-spark-1.3': { in: 1.25, cached: 0.15, out: 4.25 },
  'muse-spark-1.3-contributor': { in: 0.1, cached: 0.002, out: 0.2 },
  'muse-wonder-1.0': { in: 4, cached: 0.2, out: 20 },
  'meta-models/muse-spark-open-1026': { in: 1.25, cached: 1.25, out: 4.25 },
};

export function tokenCost(
  model: string,
  u:
    | {
        input_tokens?: number;
        output_tokens?: number;
        input_tokens_details?: { cached_tokens?: number };
      }
    | undefined,
): number {
  const p = PRICES[model];
  if (!p || !u) return 0;
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  const fresh = (u.input_tokens ?? 0) - cached;
  return (fresh * p.in + cached * p.cached + (u.output_tokens ?? 0) * p.out) / 1e6;
}

/** Strips anything that looks like a secret before it is printed or written. */
export function redact(text: string): string {
  let out = text;
  for (const name of ['META_API_KEY', 'BASETEN_API_KEY', 'ELEVENLABS_API_KEY'] as const) {
    const v = key(name);
    if (v && v.length > 6) out = out.split(v).join(`[${name}]`);
  }
  return out.replace(
    /(authorization|xi-api-key|api[-_]key)("?\s*[:=]\s*"?)(bearer\s+)?[^\s",}]+/gi,
    '$1$2[redacted]',
  );
}

export function log(...parts: unknown[]): void {
  const text = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p, null, 2))).join(' ');
  console.log(redact(text));
}

/** Writes a JSON result under .fitts-dev/verify/ (gitignored) for later reading. */
export function saveResult(name: string, data: unknown): void {
  const file = join(ROOT, '.fitts-dev', 'verify', `${name}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, redact(JSON.stringify(data, null, 2)));
}
