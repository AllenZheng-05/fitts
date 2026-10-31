// Fitts's GitHub sign-in in main: the device flow, the tokens (safeStorage), the API, and which
// way pull requests go. Signed in, PRs and pushes use the token, for only the repositories the
// user gave Fitts. Not signed in, Fitts falls back to the `gh` CLI if it's set up, so people who
// already use it aren't stuck; tests use the dry run.
import { IPC, type GitHubStatus } from '@fitts/schema';
import { BrowserWindow, ipcMain } from 'electron';
import { DryRunPrs, GhPrs, type PrBackend } from '../fix/pr';
import type { Secrets } from '../secrets';
import { ApiPrs, GitHubApi } from './api';
import { GitHubAuth, type Tokens } from './auth';

export interface GitHub {
  auth: GitHubAuth;
  api: GitHubApi;
  /** The PR backend for the next call: the API when signed in, else gh, else the dry run. */
  prs(): PrBackend;
  signedIn(): boolean;
}

export function createGitHub(secrets: Secrets): GitHub {
  const auth = new GitHubAuth({
    load: () => {
      const raw = secrets.token('github');
      try {
        return raw ? (JSON.parse(raw) as Tokens) : null;
      } catch {
        return null;
      }
    },
    save: (tokens) => secrets.setToken('github', tokens ? JSON.stringify(tokens) : null),
  });
  const token = () => auth.token();
  const api = new GitHubApi(token);
  const apiPrs = new ApiPrs(api, token);
  const signedIn = () => auth.status().state === 'signed-in';
  return {
    auth,
    api,
    signedIn,
    prs: () =>
      process.env['FITTS_GH_DRY_RUN'] === '1' ? new DryRunPrs() : signedIn() ? apiPrs : new GhPrs(),
  };
}

const offline = () => process.env['FITTS_OFFLINE'] === '1';

export function registerGitHub(github: GitHub): void {
  const send = (status: GitHubStatus) => {
    for (const win of BrowserWindow.getAllWindows())
      if (!win.webContents.isDestroyed() && !win.webContents.isOffscreen())
        win.webContents.send(IPC.githubEvent, status);
  };
  github.auth.onStatus = send;
  ipcMain.handle(IPC.githubStatus, () =>
    offline() ? ({ state: 'unavailable' } satisfies GitHubStatus) : github.auth.status(),
  );
  ipcMain.handle(IPC.githubSignIn, async () => {
    if (offline()) return { state: 'unavailable' } satisfies GitHubStatus;
    return github.auth
      .start()
      .catch((e: unknown): GitHubStatus => ({ state: 'error', message: (e as Error).message }));
  });
  ipcMain.on(IPC.githubCancel, () => github.auth.cancel());
  ipcMain.on(IPC.githubSignOut, () => github.auth.signOut());
}
