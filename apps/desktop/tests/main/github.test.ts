// @vitest-environment node
// Sign in with GitHub (device flow) and the API's helpers. No network: a fake fetch.
import { describe, expect, it } from 'vitest';
import { GitHubAuth, type Tokens } from '../../src/main/github/auth';
import { gitAuthEnv, repoFromRemote } from '../../src/main/github/api';

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as unknown as Response;

function fakeGitHub(pollAnswers: Record<string, unknown>[]) {
  const urls: string[] = [];
  const fetchFn = (url: string) => {
    urls.push(url);
    if (url.endsWith('/login/device/code'))
      return Promise.resolve(
        json({
          device_code: 'dev',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        }),
      );
    if (url.endsWith('/login/oauth/access_token'))
      return Promise.resolve(json(pollAnswers.shift() ?? { error: 'authorization_pending' }));
    if (url.endsWith('/user')) return Promise.resolve(json({ login: 'AllenZheng-05' }));
    return Promise.resolve(json({}, 404));
  };
  let saved: Tokens | null = null;
  const store = { load: () => saved, save: (t: Tokens | null) => void (saved = t) };
  return { urls, fetchFn, store, saved: () => saved };
}

describe('Sign in with GitHub', () => {
  it('shows a code, waits while GitHub says pending, then signs in and keeps the tokens', async () => {
    process.env['FITTS_GITHUB_CLIENT_ID'] = 'Iv1.test';
    let now = 1_000_000;
    const gh = fakeGitHub([
      { error: 'authorization_pending' },
      { access_token: 'ghu_x', expires_in: 28800, refresh_token: 'ghr_y' },
    ]);
    const auth = new GitHubAuth(
      gh.store,
      gh.fetchFn,
      () => now,
      () => {
        now += 5000;
        return Promise.resolve();
      },
    );
    const statuses: string[] = [];
    auth.onStatus = (s) => statuses.push(s.state === 'signed-in' ? `in:${s.login}` : s.state);
    const started = await auth.start();
    expect(started).toEqual({
      state: 'code',
      code: 'ABCD-1234',
      url: 'https://github.com/login/device',
    });
    await expect.poll(() => statuses).toEqual(['in:AllenZheng-05']);
    expect(gh.saved()).toMatchObject({ access: 'ghu_x', refresh: 'ghr_y', login: 'AllenZheng-05' });
    expect(await auth.token()).toBe('ghu_x');
    delete process.env['FITTS_GITHUB_CLIENT_ID'];
  });

  it('refreshes a token that is about to expire, and signs out when the refresh is refused', async () => {
    process.env['FITTS_GITHUB_CLIENT_ID'] = 'Iv1.test';
    const now = 1_000_000;
    const gh = fakeGitHub([{ access_token: 'ghu_new', expires_in: 28800 }, { error: 'bad' }]);
    gh.store.save({ access: 'ghu_old', expiresAt: now + 60_000, refresh: 'ghr', login: 'a' });
    const auth = new GitHubAuth(gh.store, gh.fetchFn, () => now);
    expect(await auth.token()).toBe('ghu_new');
    gh.store.save({ access: 'ghu_old', expiresAt: now + 60_000, refresh: 'ghr', login: 'a' });
    expect(await auth.token()).toBeNull();
    expect(auth.status()).toEqual({ state: 'signed-out' });
    delete process.env['FITTS_GITHUB_CLIENT_ID'];
  });

  it('says it isn’t set up without a GitHub App', () => {
    const gh = fakeGitHub([]);
    expect(new GitHubAuth(gh.store, gh.fetchFn).status()).toEqual({ state: 'unavailable' });
  });

  it('finds the repository from origin, and keeps the token out of the command line', () => {
    expect(repoFromRemote('https://github.com/AllenZheng-05/AllenZheng.git')).toBe(
      'AllenZheng-05/AllenZheng',
    );
    expect(repoFromRemote('git@github.com:AllenZheng-05/fitts.git\n')).toBe('AllenZheng-05/fitts');
    expect(repoFromRemote('https://gitlab.com/a/b.git')).toBeNull();
    const env = gitAuthEnv('ghu_x');
    expect(env['GIT_CONFIG_KEY_0']).toBe('http.https://github.com/.extraheader');
    expect(env['GIT_CONFIG_VALUE_0']).toBe(
      `AUTHORIZATION: basic ${Buffer.from('x-access-token:ghu_x').toString('base64')}`,
    );
  });
});
