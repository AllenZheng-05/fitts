import { app, BrowserWindow, Menu, session, type MenuItemConstructorOptions } from 'electron';

const isMac = process.platform === 'darwin';

export function buildAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];

  if (!app.isPackaged) {
    template.push({
      label: 'Developer',
      submenu: [{ label: 'Reset to first launch', click: () => void resetToFirstLaunch() }],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Clears persisted mock state (projects, settings, last-open project) and reloads. */
async function resetToFirstLaunch(): Promise<void> {
  await session.defaultSession.clearStorageData({ storages: ['localstorage'] });
  for (const win of BrowserWindow.getAllWindows()) win.webContents.reloadIgnoringCache();
}
