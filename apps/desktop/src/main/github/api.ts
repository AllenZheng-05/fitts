// GitHub's REST API with the signed-in user's token (auth.ts): pull requests, pushes, the
// user's GitHub Pages sites, and the checks on a PR. Only the repositories the user picked
// when they signed in are reachable: the token can't see the rest.
import { readFileSync } from 'node:fs';
import { run } from '../spawn';
import type { PrBackend, PrRef } from '../fix/pr';
import { apiHeaders } from './auth';

const API = 'https://api.github.com';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** "owner/repo" from a GitHub remote URL (https or ssh), or null for anything else. */
export function repoFromRemote(url: string): string | null {
  const m = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

/** The project's GitHub repository, from its `origin` remote. */
export async function repoOf(dir: string): Promise<string | null> {
  const res = await run('git', ['remote', 'get-url', 'origin'], { cwd: dir, timeoutMs: 10_000 });
  return res.code === 0 ? repoFromRemote(res.stdout) : null;
}

/**
 * git with the token for this one command, through git's environment config (git 2.31+), so
 * it's never in the command line, the repo's config or a credential store.
 */
export function gitAuthEnv(token: string): Record<string, string> {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    GIT_TERMINAL_PROMPT: '0',
  };
}

export class GitHubApi {
  constructor(
    private readonly token: () => Promise<string | null>,
    private readonly fetchFn: Fetch = (url, init) => fetch(url, init),
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.token();
    if (!token) throw new Error('Sign in with GitHub in Settings first.');
    const res = await this.fetchFn(`${API}${path}`, {
      ...init,
      headers: {
        ...apiHeaders(token),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (res.status === 204) return undefined as T;
    const body = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok)
      throw new Error(
        res.status === 404
          ? 'Fitts can’t see that repository. Add it to Fitts on GitHub (Settings › GitHub).'
          : `GitHub said ${res.status}: ${body.message ?? ''}`.trim(),
      );
    return body;
  }

  /** The repositories the user gave Fitts, with their Pages site when they have one. */
  async pagesSites(): Promise<{ name: string; domain: string }[]> {
    const installs = await this.call<{ installations: { id: number }[] }>('/user/installations');
    const sites: { name: string; domain: string }[] = [];
    for (const { id } of installs.installations.slice(0, 10)) {
      const repos = await this.call<{ repositories: { full_name: string; has_pages: boolean }[] }>(
        `/user/installations/${id}/repositories?per_page=100`,
      );
      for (const r of repos.repositories.filter((x) => x.has_pages).slice(0, 30)) {
        const page = await this.call<{ cname?: string | null; html_url?: string }>(
          `/repos/${r.full_name}/pages`,
        ).catch(() => null);
        const raw = page?.cname || page?.html_url || '';
        const domain = raw
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, '')
          .toLowerCase();
        if (domain) sites.push({ name: r.full_name, domain });
      }
    }
    return sites;
  }

  async defaultBranch(repo: string): Promise<string> {
    return (await this.call<{ default_branch: string }>(`/repos/${repo}`)).default_branch;
  }

  openPr(repo: string, head: string, base: string, title: string, body: string) {
    return this.call<{ number: number; html_url: string }>(`/repos/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({ title, head, base, body }),
    });
  }

  async closePr(repo: string, pr: number, branch: string): Promise<void> {
    await this.call(`/repos/${repo}/pulls/${pr}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
    await this.call(`/repos/${repo}/git/refs/heads/${branch}`, { method: 'DELETE' }).catch(
      () => undefined,
    );
  }

  async merged(repo: string, pr: number): Promise<boolean> {
    return (await this.call<{ merged?: boolean }>(`/repos/${repo}/pulls/${pr}`)).merged === true;
  }

  /** The checks GitHub ran on a PR's latest commit: still running, passed, or what failed. */
  async checks(repo: string, ref: string): Promise<{ name: string; state: string }[]> {
    const res = await this.call<{
      check_runs: { name: string; status: string; conclusion: string | null }[];
    }>(`/repos/${repo}/commits/${encodeURIComponent(ref)}/check-runs`);
    return res.check_runs.map((c) => ({
      name: c.name,
      state: c.status === 'completed' ? (c.conclusion ?? 'neutral') : c.status,
    }));
  }
}

/** Pull requests through the API, as the signed-in user (with the repositories they chose). */
export class ApiPrs implements PrBackend {
  constructor(
    private readonly api: GitHubApi,
    private readonly token: () => Promise<string | null>,
  ) {}

  async push(dir: string, branch: string): Promise<void> {
    const token = await this.token();
    if (!token) throw new Error('Sign in with GitHub in Settings first.');
    const res = await run('git', ['push', '-q', '-u', 'origin', branch], {
      cwd: dir,
      timeoutMs: 120_000,
      env: gitAuthEnv(token),
    });
    if (res.code !== 0) throw new Error(`push failed: ${res.stderr.trim().slice(0, 200)}`);
  }

  async open(
    root: string,
    dir: string,
    branch: string,
    title: string,
    bodyFile: string,
    base?: string,
  ): Promise<PrRef> {
    const repo = await repoOf(root);
    if (!repo) throw new Error('This project has no GitHub remote (origin).');
    if (base) await this.push(dir, base);
    await this.push(dir, branch);
    const pr = await this.api.openPr(
      repo,
      branch,
      base ?? (await this.api.defaultBranch(repo)),
      title,
      readFileSync(bodyFile, 'utf8'),
    );
    return { number: pr.number, url: pr.html_url };
  }

  async close(root: string, pr: number, branch: string): Promise<void> {
    const repo = await repoOf(root);
    if (repo) await this.api.closePr(repo, pr, branch);
  }

  async merged(root: string, pr: number): Promise<boolean> {
    const repo = await repoOf(root);
    return repo ? this.api.merged(repo, pr) : false;
  }
}
