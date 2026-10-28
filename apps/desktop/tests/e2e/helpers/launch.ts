import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  close: () => Promise<void>;
}

/** Launches the built app with a throwaway user-data folder. */
export async function launchApp(): Promise<LaunchedApp> {
  const userData = mkdtempSync(join(tmpdir(), 'fitts-e2e-'));
  // Shells spawned by VS Code inherit ELECTRON_RUN_AS_NODE=1, which turns Electron into
  // plain Node and makes the launch fail.
  const env: Record<string, string> = { FITTS_USER_DATA: userData };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] ??= value;
  }
  const app = await electron.launch({
    args: [resolve(__dirname, '../../../out/main/index.js')],
    env,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  return {
    app,
    page,
    close: async () => {
      await app.close();
      rmSync(userData, { recursive: true, force: true });
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
