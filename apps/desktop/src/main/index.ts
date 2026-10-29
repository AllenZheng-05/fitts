import { app, BrowserWindow, session } from 'electron';
import { registerBridge } from './bridge';
import { registerKeys } from './keys-ipc';
import { buildAppMenu } from './menu';
import { RunHost } from './run-host';
import { Secrets } from './secrets';
import { ProjectStore } from './store/projects';
import { createMainWindow, ICON_PATH } from './window';

// E2E runs point user data at a throwaway folder so they never touch real settings.
const userDataOverride = process.env['FITTS_USER_DATA'];
if (userDataOverride) app.setPath('userData', userDataOverride);

app.setName('Fitts');
// Windows groups taskbar buttons by app ID. Without one of its own, Fitts shares
// electron.exe's identity and the taskbar shows Electron's icon instead of the window's.
if (process.platform === 'win32') app.setAppUserModelId('app.fitts.desktop');

void app.whenReady().then(() => {
  // Phase 1 simulates mic and notification permission states; nothing real is granted.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );

  // The window icon covers Windows and Linux; the macOS dock takes its own.
  app.dock?.setIcon(ICON_PATH);
  registerBridge();
  // The real engine (SPEC-phase2 §1): the agent process, its run log and the project store.
  const secrets = new Secrets();
  const host = new RunHost(secrets);
  host.start();
  registerKeys(secrets, host);
  new ProjectStore(app.getPath('userData')).register();
  buildAppMenu();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
