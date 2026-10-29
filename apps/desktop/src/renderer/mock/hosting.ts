// Mock hosting connections for live-site verification (see docs/DECISIONS.md). Phase 1
// never talks to a host: "connecting" waits CONNECT_MS and returns these fixed accounts.

export type HostId = 'vercel' | 'netlify' | 'cloudflare' | 'github-pages';

export interface HostedSite {
  /** The project's name on the host. */
  name: string;
  /** A domain served by that project; owning it on the account is the proof. */
  domain: string;
}

export interface Host {
  id: HostId;
  name: string;
  sites: HostedSite[];
}

export const HOSTS: Host[] = [
  {
    id: 'vercel',
    name: 'Vercel',
    sites: [
      { name: 'hartwell-site', domain: 'hartwellstudio.com' },
      { name: 'portfolio', domain: 'allenzheng.dev' },
      { name: 'chat-demo', domain: 'chat-demo.vercel.app' },
    ],
  },
  {
    id: 'netlify',
    name: 'Netlify',
    sites: [
      { name: 'tide-tables', domain: 'tidetables.app' },
      { name: 'recipe-box', domain: 'recipe-box.netlify.app' },
    ],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    sites: [{ name: 'field-notes', domain: 'fieldnotes.blog' }],
  },
  {
    id: 'github-pages',
    name: 'GitHub Pages',
    sites: [{ name: 'allenzheng-05.github.io', domain: 'allenzheng-05.github.io' }],
  },
];

/** How long the mock "approve Fitts on your host" step takes. */
export const CONNECT_MS = 1200;

/** The TXT record a domain adds to prove ownership by DNS. */
export const DNS_RECORD_NAME = '_fitts-verify';

/** "https://Example.com/path" → "example.com". */
export const hostOf = (url: string) =>
  url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
