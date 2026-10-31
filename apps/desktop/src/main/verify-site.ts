// Live-site ownership in main (SPEC-phase2 §4.2): the dialog's checks, GitHub Pages through the
// GitHub CLI (read-only `gh api`, no new auth), and the re-check before every run. DNS and the
// file/meta check run in the agent (agent/verify-site/); offline e2e runs skip real checks.
import { IPC, type SiteVerification } from '@fitts/schema';
import { ipcMain } from 'electron';
import { run } from './spawn';
import { hostedSites, owns, TOKEN_HOSTS, type TokenHost } from './hosts';
import type { TokenName } from './secrets';

/** Saved host tokens (Secrets). */
export interface HostTokens {
  token(name: TokenName): string | undefined;
  setToken(name: TokenName, value: string | null): void;
}

const isTokenHost = (h: unknown): h is TokenHost => TOKEN_HOSTS.includes(h as TokenHost);
const hostName: Record<TokenHost, string> = {
  vercel: 'Vercel',
  netlify: 'Netlify',
  cloudflare: 'Cloudflare',
};

type Check = (
  method: 'dns' | 'file',
  domain: string,
  token: string,
) => Promise<{ ok: boolean; message: string }>;

const offline = () => process.env['FITTS_OFFLINE'] === '1';

/** Your GitHub Pages sites: each repo with Pages, by its custom domain or github.io URL. */
export async function githubPages(
  gh: (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }> = (args) =>
    run('gh', args, { cwd: process.cwd(), timeoutMs: 30_000 }),
): Promise<{ sites: { name: string; domain: string }[] } | { error: string }> {
  const repos = await gh([
    'api',
    'user/repos',
    '--paginate',
    '--jq',
    '.[] | select(.has_pages) | .full_name',
  ]);
  if (repos.code !== 0)
    return {
      error: repos.stderr.includes('auth')
        ? 'Run `gh auth login` first.'
        : 'The GitHub CLI isn’t available.',
    };
  const sites: { name: string; domain: string }[] = [];
  for (const full of repos.stdout.split(/\r?\n/).filter(Boolean).slice(0, 30)) {
    const page = await gh(['api', `repos/${full}/pages`, '--jq', '.cname // .html_url']);
    const raw = page.stdout.trim();
    const domain = raw
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
    if (page.code === 0 && domain) sites.push({ name: full, domain });
  }
  return { sites };
}

/**
 * Before a run on a live site (§4.2: never run on an unverified site). DNS and file are
 * re-checked; GitHub Pages and Vercel, Netlify or Cloudflare are listed again (with the saved
 * token), and the domain has to still be there.
 */
export async function recheck(
  domain: string,
  v: SiteVerification | undefined,
  check: Check,
  pages: typeof githubPages = githubPages,
  tokens?: HostTokens,
): Promise<{ ok: boolean; message: string }> {
  if (offline()) return { ok: true, message: 'offline' };
  if (!v) return { ok: false, message: `${domain} hasn’t been verified.` };
  if ((v.method === 'dns' || v.method === 'file') && v.token)
    return check(v.method, domain, v.token);
  if (v.method === 'host' && v.host === 'github-pages') {
    const res = await pages();
    if ('error' in res) return { ok: false, message: res.error };
    return res.sites.some((s) => s.domain === domain)
      ? { ok: true, message: 'Still on your GitHub Pages.' }
      : { ok: false, message: `${domain} isn’t one of your GitHub Pages sites anymore.` };
  }
  if (v.method === 'host' && isTokenHost(v.host)) {
    const token = tokens?.token(`host:${v.host}`);
    if (!token)
      return {
        ok: false,
        message: `Fitts isn’t connected to ${hostName[v.host]} anymore. Connect it again in Add a project.`,
      };
    const sites = await hostedSites(v.host, token).catch((e: unknown) => e as Error);
    if (sites instanceof Error) return { ok: false, message: sites.message };
    return owns(v.host, sites, domain)
      ? { ok: true, message: `Still on your ${hostName[v.host]} account.` }
      : { ok: false, message: `${domain} isn’t on your ${hostName[v.host]} account anymore.` };
  }
  return { ok: false, message: `${domain} hasn’t been verified.` };
}

export function registerVerify(
  check: Check,
  pages: typeof githubPages = githubPages,
  tokens?: HostTokens,
): void {
  // Vercel, Netlify, Cloudflare: a token the user made, saved only once it lists their sites.
  ipcMain.handle(IPC.hostConnect, async (_e, host: unknown, token: unknown) => {
    if (offline() || !tokens || !isTokenHost(host)) return null;
    if (typeof token !== 'string' || !token.trim()) return { error: 'Paste a token first.' };
    try {
      const sites = await hostedSites(host, token.trim());
      tokens.setToken(`host:${host}`, token.trim());
      return { sites };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });
  ipcMain.handle(IPC.hostSites, async (_e, host: unknown) => {
    if (offline() || !tokens || !isTokenHost(host)) return null;
    const token = tokens.token(`host:${host}`);
    if (!token) return null;
    return hostedSites(host, token)
      .then((sites) => ({ sites }))
      .catch((e: unknown) => ({ error: (e as Error).message }));
  });
  ipcMain.on(IPC.hostForget, (_e, host: unknown) => {
    if (tokens && isTokenHost(host)) tokens.setToken(`host:${host}`, null);
  });
  ipcMain.handle(IPC.verifyCheck, (_e, method: unknown, domain: unknown, token: unknown) => {
    if (offline()) return { ok: true, message: '', offline: true };
    if (
      (method !== 'dns' && method !== 'file') ||
      typeof domain !== 'string' ||
      typeof token !== 'string'
    )
      return { ok: false, message: 'Bad request.' };
    return check(method, domain, token);
  });
  ipcMain.handle(IPC.verifyPages, () => (offline() ? null : pages()));
}
