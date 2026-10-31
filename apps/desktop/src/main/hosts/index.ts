// Live-site ownership through the user's host (Vercel, Netlify, Cloudflare): with a token the
// user creates on the host (read access is enough), Fitts lists their sites and the domains
// each serves. A site counts as theirs when its domain is on that list, and it's checked again
// before every run. Tokens are kept with safeStorage in main; the renderer never sees one.
import type { HostId } from '@fitts/schema';

export type TokenHost = Exclude<HostId, 'github-pages'>;
export const TOKEN_HOSTS: TokenHost[] = ['vercel', 'netlify', 'cloudflare'];

export interface HostedSite {
  name: string;
  domain: string;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const clean = (d: string) =>
  d
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

async function json<T>(fetchFn: Fetch, url: string, token: string): Promise<T> {
  const res = await fetchFn(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (res.status === 401 || res.status === 403)
    throw new Error('That token doesn’t work. Check it has read access, or make a new one.');
  if (!res.ok) throw new Error(`The host said ${res.status}.`);
  return (await res.json()) as T;
}

/** Vercel: each project and the domains it serves (custom and *.vercel.app). */
async function vercel(token: string, fetchFn: Fetch): Promise<HostedSite[]> {
  const { projects } = await json<{ projects: { id: string; name: string }[] }>(
    fetchFn,
    'https://api.vercel.com/v9/projects?limit=100',
    token,
  );
  const out: HostedSite[] = [];
  for (const p of projects.slice(0, 40)) {
    const { domains } = await json<{ domains: { name: string; verified?: boolean }[] }>(
      fetchFn,
      `https://api.vercel.com/v9/projects/${encodeURIComponent(p.id)}/domains?limit=50`,
      token,
    ).catch(() => ({ domains: [] }));
    for (const d of domains)
      if (d.verified !== false) out.push({ name: p.name, domain: clean(d.name) });
  }
  return out;
}

/** Netlify: each site, its own netlify.app address, its custom domain and aliases. */
async function netlify(token: string, fetchFn: Fetch): Promise<HostedSite[]> {
  const sites = await json<
    {
      name: string;
      url?: string;
      ssl_url?: string;
      custom_domain?: string | null;
      domain_aliases?: string[];
    }[]
  >(fetchFn, 'https://api.netlify.com/api/v1/sites?per_page=100', token);
  return sites.flatMap((s) =>
    [s.custom_domain, ...(s.domain_aliases ?? []), s.ssl_url ?? s.url]
      .filter((d): d is string => Boolean(d))
      .map((d) => ({ name: s.name, domain: clean(d) })),
  );
}

/** Cloudflare: each Pages project's domains, and the zones (domains) on the account. */
async function cloudflare(token: string, fetchFn: Fetch): Promise<HostedSite[]> {
  const out: HostedSite[] = [];
  const accounts = await json<{ result: { id: string; name: string }[] }>(
    fetchFn,
    'https://api.cloudflare.com/client/v4/accounts?per_page=20',
    token,
  );
  for (const a of accounts.result.slice(0, 5)) {
    const pages = await json<{
      result: { name: string; subdomain?: string; domains?: string[] }[];
    }>(
      fetchFn,
      `https://api.cloudflare.com/client/v4/accounts/${a.id}/pages/projects`,
      token,
    ).catch(() => ({ result: [] }));
    for (const p of pages.result)
      for (const d of [...(p.domains ?? []), ...(p.subdomain ? [p.subdomain] : [])])
        out.push({ name: p.name, domain: clean(d) });
  }
  // A zone on the account is a domain the account controls (its DNS), for any site on it.
  const zones = await json<{ result: { name: string; status: string }[] }>(
    fetchFn,
    'https://api.cloudflare.com/client/v4/zones?per_page=50',
    token,
  ).catch(() => ({ result: [] }));
  for (const z of zones.result)
    if (z.status === 'active') out.push({ name: z.name, domain: clean(z.name) });
  return out;
}

const LISTERS: Record<TokenHost, (token: string, fetchFn: Fetch) => Promise<HostedSite[]>> = {
  vercel,
  netlify,
  cloudflare,
};

/** Every site on the account, de-duplicated by domain. */
export async function hostedSites(
  host: TokenHost,
  token: string,
  fetchFn: Fetch = (url, init) => fetch(url, init),
): Promise<HostedSite[]> {
  const seen = new Set<string>();
  return (await LISTERS[host](token, fetchFn)).filter((s) => {
    if (!s.domain || seen.has(s.domain)) return false;
    seen.add(s.domain);
    return true;
  });
}

/**
 * Is `domain` the user's on this host? A Cloudflare zone covers its subdomains too (the account
 * controls the zone's DNS); otherwise the exact domain must be on the list.
 */
export function owns(host: TokenHost, sites: HostedSite[], domain: string): boolean {
  const d = clean(domain);
  return sites.some(
    (s) =>
      s.domain === d ||
      (host === 'cloudflare' && s.name === s.domain && d.endsWith(`.${s.domain}`)),
  );
}
