// The hosts a live site can be proved through (§4.2): connect one and your site counts as
// yours when its domain is on your account. GitHub Pages goes through Sign in with GitHub (or
// the gh CLI); Vercel, Netlify and Cloudflare through a token you make on the host.
import type { HostId } from '@fitts/schema';

export type { HostId };

export interface HostedSite {
  /** The project's name on the host. */
  name: string;
  /** A domain served by that project; owning it on the account is the proof. */
  domain: string;
}

export interface Host {
  id: HostId;
  name: string;
  /** The account's sites, once connected. */
  sites: HostedSite[];
}

export const HOSTS: Host[] = [
  { id: 'vercel', name: 'Vercel', sites: [] },
  { id: 'netlify', name: 'Netlify', sites: [] },
  { id: 'cloudflare', name: 'Cloudflare', sites: [] },
  { id: 'github-pages', name: 'GitHub Pages', sites: [] },
];

/** The TXT record a domain adds to prove ownership by DNS. */
export const DNS_RECORD_NAME = '_fitts-verify';

/** "https://Example.com/path" → "example.com". */
export const hostOf = (url: string) =>
  url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
