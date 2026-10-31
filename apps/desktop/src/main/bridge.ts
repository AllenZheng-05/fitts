import { BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import { writeFile } from 'node:fs/promises';
import { IPC } from '@fitts/schema';

// E2E runs answer native dialogs through env vars, since tests can't click OS dialogs.
const e2eFolder = process.env['FITTS_E2E_PICK_FOLDER'];
const e2eSavePath = process.env['FITTS_E2E_SAVE_PATH'];

/** Every notification requested this session (e2e tests read it through the main process). */
const sentNotifications: { id: string; title: string; body: string }[] = [];
(globalThis as { fittsNotifications?: typeof sentNotifications }).fittsNotifications =
  sentNotifications;

/** Sites Fitts opens in the user's browser: pull requests and the hosts it works with. */
const LINK_HOSTS = ['github.com', 'vercel.com', 'app.netlify.com', 'dash.cloudflare.com'];

/** A link the renderer may open: https, on a host Fitts works with. */
export function openableLink(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && LINK_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/** The small set of native features the renderer may use (SPEC §2, §3). */
export function registerBridge(): void {
  ipcMain.on(IPC.openLink, (_e, url: unknown) => {
    if (openableLink(url)) void shell.openExternal(url);
  });

  ipcMain.handle(IPC.pickFolder, async (event) => {
    if (e2eFolder !== undefined) return e2eFolder || null;
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { properties: ['openDirectory' as const, 'createDirectory' as const] };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC.saveTextFile, async (event, suggestedName: string, content: string) => {
    let path = e2eSavePath;
    if (path === undefined) {
      const win = BrowserWindow.fromWebContents(event.sender);
      const options = {
        defaultPath: suggestedName,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return null;
      path = result.filePath;
    }
    await writeFile(path, content, 'utf8');
    return path;
  });

  ipcMain.on(IPC.notify, (event, n: { id: string; title: string; body: string }) => {
    // Kept for e2e checks, which can't see OS notifications.
    sentNotifications.push(n);
    if (!Notification.isSupported()) return;
    const notification = new Notification({ title: n.title, body: n.body, silent: false });
    notification.on('click', () => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
      if (!event.sender.isDestroyed()) event.sender.send(IPC.notificationClick, n.id);
    });
    notification.show();
  });
}
