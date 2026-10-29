import { app, BrowserWindow, session } from 'electron';
import { registerBridge } from './bridge';
import { buildAppMenu } from './menu';
import { createMainWindow } from './window';

// E2E runs point user data at a throwaway folder so they never touch real settings.
const userDataOverride = process.env['FITTS_USER_DATA'];
if (userDataOverride) app.setPath('userData', userDataOverride);

app.setName('Fitts');

void app.whenReady().then(() => {
  // Phase 1 simulates mic and notification permission states; nothing real is granted.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );

  registerBridge();
  buildAppMenu();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
