// @vitest-environment node
// Live-site ownership through Vercel, Netlify and Cloudflare: their sites and domains from each
// API (a fake fetch, no network), and what counts as yours.
import { describe, expect, it } from 'vitest';
import { hostedSites, owns } from '../../src/main/hosts';

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as unknown as Response;

function fake(routes: Record<string, unknown>) {
  const seen: { url: string; auth: string }[] = [];
  const fetchFn = (url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? '';
    seen.push({ url, auth });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    return Promise.resolve(
      key
        ? ok(routes[key])
        : ({ ok: false, status: 404, json: () => Promise.resolve({}) } as unknown as Response),
    );
  };
  return { fetchFn, seen };
}

describe('hosts', () => {
  it('Vercel: every project’s verified domains, with the token as a bearer', async () => {
    const { fetchFn, seen } = fake({
      'https://api.vercel.com/v9/projects?': { projects: [{ id: 'p1', name: 'portfolio' }] },
      'https://api.vercel.com/v9/projects/p1/domains': {
        domains: [
          { name: 'allenzheng.com', verified: true },
          { name: 'portfolio-allen.vercel.app', verified: true },
          { name: 'pending.example', verified: false },
        ],
      },
    });
    const sites = await hostedSites('vercel', 'tok', fetchFn);
    expect(sites.map((s) => s.domain)).toEqual(['allenzheng.com', 'portfolio-allen.vercel.app']);
    expect(seen.every((s) => s.auth === 'Bearer tok')).toBe(true);
  });

  it('Netlify: custom domains, aliases and the netlify.app address, once each', async () => {
    const { fetchFn } = fake({
      'https://api.netlify.com/api/v1/sites': [
        {
          name: 'retro',
          ssl_url: 'https://retro-allen.netlify.app',
          custom_domain: 'retro.example.com',
          domain_aliases: ['www.retro.example.com', 'retro.example.com'],
        },
      ],
    });
    const sites = await hostedSites('netlify', 'tok', fetchFn);
    expect(sites.map((s) => s.domain)).toEqual([
      'retro.example.com',
      'www.retro.example.com',
      'retro-allen.netlify.app',
    ]);
  });

  it('Cloudflare: Pages domains, and an active zone covers its subdomains', async () => {
    const { fetchFn } = fake({
      'https://api.cloudflare.com/client/v4/accounts?': { result: [{ id: 'a1', name: 'Allen' }] },
      'https://api.cloudflare.com/client/v4/accounts/a1/pages/projects': {
        result: [
          {
            name: 'fitts-site',
            subdomain: 'fitts-site.pages.dev',
            domains: ['fitts.allenzheng.com'],
          },
        ],
      },
      'https://api.cloudflare.com/client/v4/zones': {
        result: [
          { name: 'allenzheng.com', status: 'active' },
          { name: 'old.dev', status: 'moved' },
        ],
      },
    });
    const sites = await hostedSites('cloudflare', 'tok', fetchFn);
    expect(owns('cloudflare', sites, 'fitts.allenzheng.com')).toBe(true);
    expect(owns('cloudflare', sites, 'blog.allenzheng.com')).toBe(true);
    expect(owns('cloudflare', sites, 'old.dev')).toBe(false);
    expect(owns('cloudflare', sites, 'allenzheng.com.evil.com')).toBe(false);
  });

  it('an exact domain only, for Vercel and Netlify; a bad token says so', async () => {
    const sites = [{ name: 'p', domain: 'allenzheng.com' }];
    expect(owns('vercel', sites, 'https://AllenZheng.com/about')).toBe(true);
    expect(owns('vercel', sites, 'blog.allenzheng.com')).toBe(false);
    const denied = (() =>
      Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) })) as never;
    await expect(hostedSites('netlify', 'bad', denied)).rejects.toThrow('doesn’t work');
  });
});
