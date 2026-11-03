// Nothing private leaves in a report: no API keys or tokens, no saved logins, no paths on the
// machine that ran Fitts. Every string of the report passes through `scrub` once (`scrubDeep`),
// and the written folder is scanned again afterwards (`scanText`), so a miss in one is caught by
// the other.

export const REDACTED = '[redacted]';
export const LOCAL_PATH = '[local path]';

/** Key and token shapes from the providers Fitts and its users touch. */
const KEY_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI-style keys (Meta's Muse API uses the same shape)
  /\bsk_[A-Za-z0-9]{20,}/g, // ElevenLabs
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key ids
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google API keys
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/** "api_key=abc…", "password: hunter22", "Bearer abc…": the value goes, the label stays. */
const LABELLED =
  /\b(api[_-]?key|apikey|x-api-key|authorization|access[_-]?token|client[_-]?secret|secret|password|passwd|token)(["']?\s*[:=]\s*["']?)([^\s"'`,;&<>]{8,})|\b(bearer)(\s+)([A-Za-z0-9._~+/-]{8,}=*)/gi;
/** The same labels with a quoted value, spaces and all: `"password": "correct horse 9"`. */
const QUOTED =
  /\b(api[_-]?key|apikey|x-api-key|access[_-]?token|client[_-]?secret|secret|password|passwd)(["']?\s*[:=]\s*)(["'])([^"'\n]{4,}?)\3/gi;

/**
 * A long run of letters and digits that isn't a word, a hex hash (a git sha is fine to show) or
 * part of a path or file name: treated as a key. Needs both letters and digits, and mixed case
 * or a digit-letter mix dense enough not to be prose.
 */
const OPAQUE = /(?<![\w./-])[A-Za-z0-9_-]{32,}(?![\w./-])/g;
const looksLikeKey = (s: string) =>
  !/^[0-9a-f]+$/i.test(s) &&
  /[0-9]/.test(s) &&
  /[A-Za-z]/.test(s) &&
  !/^[a-z]+(-[a-z0-9]+)+$/.test(s) && // kebab-case ids and slugs
  (s.match(/[0-9]/g)?.length ?? 0) >= 4;

/** Absolute paths on Windows, macOS and Linux, and file: URLs. */
const PATH_PATTERNS: RegExp[] = [
  /\bfile:\/\/\/?[^\s"'<>)`]+/gi,
  /\b[A-Za-z]:[\\/](?:[^\s"'<>|*?`\\/:]+[\\/]?)+/g, // C:\Users\… or C:/Users/…
  /\\\\[A-Za-z0-9._-]+\\[^\s"'<>`]+/g, // \\server\share
  // Home folders need a user and something under it ("/home/feed" can be a site's own route).
  /(?<![\w.:/-])\/(?:Users|home)\/[^\s"'<>)`/]+\/[^\s"'<>)`]+/g,
  /(?<![\w.:/-])\/(?:root|private\/var|var\/folders|tmp|mnt|Volumes)\/[^\s"'<>)`]+/g,
  /~[\\/][^\s"'<>)`]+/g,
];

/** Replaces keys, tokens and local paths in one string. */
export function scrub(text: string): string {
  let out = text;
  for (const re of KEY_PATTERNS) out = out.replace(re, REDACTED);
  out = out.replace(
    QUOTED,
    (_m, label: string, sep: string, q: string) => `${label}${sep}${q}${REDACTED}${q}`,
  );
  out = out.replace(
    LABELLED,
    (_m, label?: string, sep?: string, _v?: string, bLabel?: string, bSep?: string) =>
      `${label ?? bLabel ?? ''}${sep ?? bSep ?? ''}${REDACTED}`,
  );
  out = out.replace(OPAQUE, (m) => (looksLikeKey(m) ? REDACTED : m));
  for (const re of PATH_PATTERNS) out = out.replace(re, LOCAL_PATH);
  return out;
}

/** `scrub` on every string inside a JSON-like value (object keys included). */
export function scrubDeep<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return scrub(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[scrub(k)] = walk(x);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

export interface Leak {
  kind: 'key' | 'path';
  match: string;
}

/** What `scrub` would still change in a text: anything here is a leak in written output. */
export function scanText(text: string): Leak[] {
  const leaks: Leak[] = [];
  const find = (re: RegExp, kind: Leak['kind'], keep: (m: string) => boolean = () => true) => {
    for (const m of text.matchAll(new RegExp(re.source, re.flags))) {
      if (keep(m[0])) leaks.push({ kind, match: m[0].slice(0, 60) });
    }
  };
  for (const re of KEY_PATTERNS) find(re, 'key');
  find(LABELLED, 'key', (m) => !m.includes(REDACTED));
  find(QUOTED, 'key', (m) => !m.includes(REDACTED));
  find(OPAQUE, 'key', looksLikeKey);
  for (const re of PATH_PATTERNS) find(re, 'path');
  return leaks;
}
