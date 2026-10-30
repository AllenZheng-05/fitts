// @vitest-environment node
// Live-site ownership in main (§4.2): the re-check before each run, and GitHub Pages via gh.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
const { githubPages, recheck } = await import('../../src/main/verify-site');

const offline = process.env['FITTS_OFFLINE'];
afterEach(() => {
  if (offline === undefined) delete process.env['FITTS_OFFLINE'];
  else process.env['FITTS_OFFLINE'] = offline;
});

describe('GitHub Pages', () => {
  it('lists repos with Pages by their custom domain or github.io URL', async () => {
    const calls: string[][] = [];
    const gh = (args: string[]) => {
      calls.push(args);
      if (args[1] === 'user/repos')
        return Promise.resolve({ code: 0, stdout: 'allen/site\nallen/blog\n', stderr: '' });
      if (args[1] === 'repos/allen/site/pages')
        return Promise.resolve({ code: 0, stdout: 'hartwellstudio.com\n', stderr: '' });
      return Promise.resolve({ code: 0, stdout: 'https://allen.github.io/blog/\n', stderr: '' });
    };
    expect(await githubPages(gh)).toEqual({
      sites: [
        { name: 'allen/site', domain: 'hartwellstudio.com' },
        { name: 'allen/blog', domain: 'allen.github.io' },
      ],
    });
    expect(calls.every((c) => c[0] === 'api')).toBe(true);
  });

  it('says what to do when gh isn’t logged in', async () => {
    const gh = () => Promise.resolve({ code: 1, stdout: '', stderr: 'gh auth login required' });
    expect(await githubPages(gh)).toEqual({ error: 'Run `gh auth login` first.' });
  });
});

describe('the re-check before each run', () => {
  const pass = () => Promise.resolve({ ok: true, message: 'ok' });
  const fail = () => Promise.resolve({ ok: false, message: 'no record' });

  it('never opens an unverified site', async () => {
    delete process.env['FITTS_OFFLINE'];
    expect((await recheck('example.com', undefined, pass)).ok).toBe(false);
  });

  it('re-checks DNS and file with the stored token', async () => {
    delete process.env['FITTS_OFFLINE'];
    const v = { method: 'dns' as const, token: 'fitts-verify=X', verifiedAt: '' };
    expect((await recheck('example.com', v, pass)).ok).toBe(true);
    expect(await recheck('example.com', v, fail)).toEqual({ ok: false, message: 'no record' });
  });

  it('re-lists GitHub Pages', async () => {
    delete process.env['FITTS_OFFLINE'];
    const v = { method: 'host' as const, host: 'github-pages', verifiedAt: '' };
    const pages = () => Promise.resolve({ sites: [{ name: 'a/b', domain: 'example.com' }] });
    expect((await recheck('example.com', v, pass, pages)).ok).toBe(true);
    expect((await recheck('other.com', v, pass, pages)).ok).toBe(false);
  });
});
