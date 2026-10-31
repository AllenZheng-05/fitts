// Sign in with GitHub (Allen's feedback: Fitts shouldn't quietly borrow `gh`). Fitts is a GitHub
// App; a desktop app signs its user in with GitHub's device flow, so there's no server and no
// secret in the app: Fitts shows a short code, the user enters it on github.com and picks which
// repositories Fitts may use. The tokens live in safeStorage (main only); the renderer only
// learns the login. GitHub App user tokens expire after 8 hours and are refreshed here.
import type { GitHubStatus } from '@fitts/schema';

/** The registered GitHub App's client id (public: device flow has no secret). */
export const clientId = () => process.env['FITTS_GITHUB_CLIENT_ID'] ?? GITHUB_CLIENT_ID;
/** Filled in once the Fitts GitHub App is registered (NEEDS-ALLEN). */
export const GITHUB_CLIENT_ID = '';
/** The app's name in its github.com/apps/<slug> URL, for "Choose repositories". */
export const GITHUB_APP_SLUG = '';
const appSlug = () => process.env['FITTS_GITHUB_APP_SLUG'] ?? GITHUB_APP_SLUG;

const DEVICE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API = 'https://api.github.com';
/** Refresh this long before a token expires. */
const EARLY_MS = 5 * 60_000;

export interface Tokens {
  access: string;
  /** When the access token expires (ms since epoch); absent for tokens that don't. */
  expiresAt?: number;
  refresh?: string;
  login: string;
}

/** Where tokens are kept (Secrets, encrypted with safeStorage). */
export interface TokenStore {
  load(): Tokens | null;
  save(tokens: Tokens | null): void;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const form = (body: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(body).toString(),
});

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  interval?: number;
}

export class GitHubAuth {
  private pending: { cancelled: boolean } | undefined;
  /** Status changes (signed in, waiting for the code, signed out), for the renderer. */
  onStatus: ((status: GitHubStatus) => void) | undefined;

  constructor(
    private readonly store: TokenStore,
    private readonly fetchFn: Fetch = (url, init) => fetch(url, init),
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  status(): GitHubStatus {
    if (!clientId()) return { state: 'unavailable' };
    const t = this.store.load();
    const slug = appSlug();
    return t
      ? {
          state: 'signed-in',
          login: t.login,
          ...(slug ? { installUrl: `https://github.com/apps/${slug}/installations/new` } : {}),
        }
      : { state: 'signed-out' };
  }

  /**
   * Starts the device flow: returns the code to show, then keeps polling until the user enters
   * it (signed in), it expires, or they cancel. Status updates go to `onStatus`.
   */
  async start(): Promise<GitHubStatus> {
    const id = clientId();
    if (!id) return { state: 'unavailable' };
    this.cancel();
    const res = await this.fetchFn(DEVICE_URL, form({ client_id: id }));
    if (!res.ok) return { state: 'error', message: `GitHub said ${res.status}` };
    const code = (await res.json()) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval?: number;
    };
    const status: GitHubStatus = {
      state: 'code',
      code: code.user_code,
      url: code.verification_uri,
    };
    const job = { cancelled: false };
    this.pending = job;
    void this.poll(id, code.device_code, (code.interval ?? 5) * 1000, code.expires_in, job);
    return status;
  }

  cancel(): void {
    if (this.pending) this.pending.cancelled = true;
    this.pending = undefined;
  }

  signOut(): void {
    this.cancel();
    this.store.save(null);
    this.onStatus?.(this.status());
  }

  private async poll(
    id: string,
    deviceCode: string,
    intervalMs: number,
    expiresIn: number,
    job: { cancelled: boolean },
  ): Promise<void> {
    const deadline = this.now() + expiresIn * 1000;
    let interval = intervalMs;
    while (!job.cancelled && this.now() < deadline) {
      await this.wait(interval);
      if (job.cancelled) return;
      let body: TokenResponse;
      try {
        const res = await this.fetchFn(
          TOKEN_URL,
          form({
            client_id: id,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        );
        body = (await res.json()) as TokenResponse;
      } catch {
        continue;
      }
      if (body.error === 'authorization_pending') continue;
      if (body.error === 'slow_down') {
        interval = (body.interval ?? interval / 1000 + 5) * 1000;
        continue;
      }
      if (body.error || !body.access_token) {
        this.pending = undefined;
        this.onStatus?.({
          state: 'error',
          message:
            body.error === 'access_denied'
              ? 'You cancelled on GitHub.'
              : body.error === 'expired_token'
                ? 'The code expired. Try again.'
                : 'GitHub didn’t sign you in.',
        });
        return;
      }
      const login = await this.login(body.access_token);
      this.store.save({ ...this.tokensFrom(body), login });
      this.pending = undefined;
      this.onStatus?.(this.status());
      return;
    }
    if (!job.cancelled)
      this.onStatus?.({ state: 'error', message: 'The code expired. Try again.' });
  }

  private tokensFrom(body: TokenResponse): Omit<Tokens, 'login'> {
    return {
      access: body.access_token ?? '',
      ...(body.expires_in ? { expiresAt: this.now() + body.expires_in * 1000 } : {}),
      ...(body.refresh_token ? { refresh: body.refresh_token } : {}),
    };
  }

  private async login(token: string): Promise<string> {
    const res = await this.fetchFn(`${API}/user`, { headers: apiHeaders(token) });
    const user = (await res.json()) as { login?: string };
    return user.login ?? '';
  }

  /** A current access token, refreshed if it's about to expire; null when signed out. */
  async token(): Promise<string | null> {
    const t = this.store.load();
    if (!t) return null;
    if (!t.expiresAt || t.expiresAt - EARLY_MS > this.now()) return t.access;
    if (!t.refresh) return null;
    const res = await this.fetchFn(
      TOKEN_URL,
      form({ client_id: clientId(), grant_type: 'refresh_token', refresh_token: t.refresh }),
    ).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as TokenResponse) : {};
    if (!body.access_token) {
      // The refresh token expired or was revoked: signed out, and the user signs in again.
      this.store.save(null);
      this.onStatus?.(this.status());
      return null;
    }
    this.store.save({ ...this.tokensFrom(body), login: t.login });
    return body.access_token;
  }
}

/** Headers for a GitHub REST call. The token never goes into a log. */
export const apiHeaders = (token: string): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Fitts',
});
