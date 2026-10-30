// Proving a live site is yours (SPEC-phase2 §4.2), before Fitts touches it at all. Two checks
// here: a DNS TXT record at `_fitts-verify.<domain>`, or the token at
// `https://<domain>/.well-known/fitts-verify.txt` (or a `<meta name="fitts-verify">` tag on the
// home page). Connecting a host (GitHub Pages via gh) is in main, which owns the spawner.
import { promises as dns } from 'node:dns';

export const DNS_PREFIX = '_fitts-verify';
export const FILE_PATH = '/.well-known/fitts-verify.txt';

export interface VerifyOutcome {
  ok: boolean;
  /** One plain sentence for the dialog. */
  message: string;
}

/** "https://Example.com/path" → "example.com"; anything that isn't a hostname → "". */
export function domainOf(input: string): string {
  const host = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .toLowerCase();
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : '';
}

/** The token as published may be bare or `fitts-verify=<token>`; both count. */
const matches = (value: string, token: string) => {
  const v = value.trim().replace(/^"|"$/g, '');
  const bare = token.replace(/^fitts-verify=/, '');
  return v === token || v === bare || v === `fitts-verify=${bare}`;
};

export async function verifyDns(
  domain: string,
  token: string,
  resolveTxt: (name: string) => Promise<string[][]> = (name) => dns.resolveTxt(name),
): Promise<VerifyOutcome> {
  const name = `${DNS_PREFIX}.${domain}`;
  let records: string[][];
  try {
    records = await resolveTxt(name);
  } catch {
    return {
      ok: false,
      message: `I couldn’t find a TXT record at ${name} yet. DNS can take a few minutes.`,
    };
  }
  return records.some((parts) => matches(parts.join(''), token))
    ? { ok: true, message: `Found the record at ${name}.` }
    : { ok: false, message: `There’s a TXT record at ${name}, but it doesn’t match your token.` };
}

export async function verifyFile(
  domain: string,
  token: string,
  get: (url: string) => Promise<{ status: number; text: string }> = async (url) => {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    return { status: res.status, text: (await res.text()).slice(0, 200_000) };
  },
  base = `https://${domain}`,
): Promise<VerifyOutcome> {
  try {
    const file = await get(`${base}${FILE_PATH}`);
    if (file.status === 200 && matches(file.text, token))
      return { ok: true, message: `Found the token at ${FILE_PATH}.` };
  } catch {
    // Try the meta tag.
  }
  try {
    const home = await get(`${base}/`);
    const meta = /<meta\s+[^>]*name=["']fitts-verify["'][^>]*>/i.exec(home.text)?.[0] ?? '';
    const content = /content=["']([^"']*)["']/i.exec(meta)?.[1];
    if (home.status === 200 && content !== undefined && matches(content, token))
      return { ok: true, message: 'Found the fitts-verify meta tag on your home page.' };
  } catch {
    return { ok: false, message: `I couldn’t reach ${domain}.` };
  }
  return {
    ok: false,
    message: `I couldn’t find your token at ${FILE_PATH} or in a fitts-verify meta tag.`,
  };
}
