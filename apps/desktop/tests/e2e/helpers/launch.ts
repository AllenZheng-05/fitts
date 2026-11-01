import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  /** The user-data folder; pass it to the next launch to test persistence. */
  userData: string;
  close: (opts?: { keepUserData?: boolean }) => Promise<void>;
}

/** Where the e2e folder picker "chooses" by default. */
export const E2E_FOLDER = '/Users/allen/code/fitts/demo/chat';

interface LaunchOptions {
  /** Reuse a user-data folder from an earlier launch. */
  userData?: string;
  env?: Record<string, string>;
  /** Extra Chromium switches (for example a fake mic). */
  args?: string[];
}

/** Launches the built app with a throwaway user-data folder. */
export async function launchApp({
  userData,
  env: extra = {},
  args = [],
}: LaunchOptions = {}): Promise<LaunchedApp> {
  const dir = userData ?? mkdtempSync(join(tmpdir(), 'fitts-e2e-'));
  // Shells spawned by VS Code inherit ELECTRON_RUN_AS_NODE=1, which turns Electron into
  // plain Node and makes the launch fail.
  const env: Record<string, string> = {
    FITTS_USER_DATA: dir,
    FITTS_E2E_PICK_FOLDER: E2E_FOLDER,
    FITTS_E2E_SAVE_PATH: join(dir, 'report.md'),
    // Tests never call the network and never read the developer's .env.local keys.
    FITTS_OFFLINE: '1',
    FITTS_NO_DEV_KEYS: '1',
    ...extra,
  };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] ??= value;
  }
  const app = await electron.launch({
    args: [resolve(__dirname, '../../../out/main/index.js'), ...args],
    env,
  });
  // A test may quit the app itself (closing its window); then there's nothing to close.
  let exited = false;
  app.on('close', () => (exited = true));
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  return {
    app,
    page,
    userData: dir,
    close: async ({ keepUserData = false } = {}) => {
      if (!exited) await app.close();
      if (!keepUserData) rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Sets the window's content (viewport) size from the main process. */
export async function setContentSize(app: ElectronApplication, width: number, height: number) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height);
    },
    { width, height },
  );
}

export interface WindowMetrics {
  content: { width: number; height: number };
  outer: { width: number; height: number };
  min: { width: number; height: number };
  workArea: { width: number; height: number };
}

export async function getWindowMetrics(app: ElectronApplication): Promise<WindowMetrics> {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('No window');
    const pair = ([width = 0, height = 0]: number[]) => ({ width, height });
    const { workArea } = screen.getDisplayMatching(win.getBounds());
    return {
      content: pair(win.getContentSize()),
      outer: pair(win.getSize()),
      min: pair(win.getMinimumSize()),
      workArea: { width: workArea.width, height: workArea.height },
    };
  });
}
