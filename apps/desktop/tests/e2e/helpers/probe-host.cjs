// A bare Electron window for the probe fixture tests (tests/e2e/probes.spec.ts): real Chromium
// layout and styles, no app around it.
const { app, BrowserWindow } = require('electron');

void app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1024,
    height: 700,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  void win.loadURL('about:blank');
});
