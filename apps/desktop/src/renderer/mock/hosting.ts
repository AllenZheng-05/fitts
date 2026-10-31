// Mock hosting connections for live-site verification (see docs/DECISIONS.md). Phase 1
// never talks to a host: "connecting" waits CONNECT_MS and returns these fixed accounts.

import type { Host } from '../lib/hosts';

/** Phase 1's fixed accounts, for the test harness (offline e2e). */
export const MOCK_HOSTS: Host[] = [
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
