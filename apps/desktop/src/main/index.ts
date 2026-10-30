import { app, BrowserWindow, session } from 'electron';
import { handleAssets, registerAssetScheme } from './asset-protocol';
import { registerBridge } from './bridge';
import { registerKeys } from './keys-ipc';
import { buildAppMenu } from './menu';
import { RunHost } from './run-host';
import { Secrets } from './secrets';
import { FixHost } from './fix/fix-host';
import { VoiceHost } from './voice';
import { registerReplay } from './replay';
import { recheck, registerVerify } from './verify-site';
import { SiteManager } from './site/manager';
import { ProjectStore } from './store/projects';
import { APP_ID, createMainWindow, ICON_PATH } from './window';

// E2E runs point user data at a throwaway folder so they never touch real settings.
const userDataOverride = process.env['FITTS_USER_DATA'];
if (userDataOverride) app.setPath('userData', userDataOverride);

app.setName('Fitts');
registerAssetScheme();
// Windows groups taskbar buttons by app ID. Without one of its own, Fitts shares
// electron.exe's identity and the taskbar shows Electron's icon instead of the window's.
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

void app.whenReady().then(() => {
  // The app's own page may use the microphone, audio only (SPEC-phase2 §14); nothing else is
  // ever granted. Site windows have their own sessions, which deny everything.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const types = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
    callback(permission === 'media' && types.length > 0 && types.every((t) => t === 'audio'));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  // The window icon covers Windows and Linux; the macOS dock takes its own.
  app.dock?.setIcon(ICON_PATH);
  registerBridge();
  // The real engine (SPEC-phase2 §1): the agent process, its run log and the project store.
  const userData = app.getPath('userData');
  handleAssets(userData);
  const secrets = new Secrets();
  const host = new RunHost(secrets);
  const projects = new ProjectStore(userData);
  const sites = new SiteManager(userData, (id) => projects.get(id));
  host.onStep = (projectId, runId, step) => void sites.shot(projectId, runId, step);
  const fixes = new FixHost((id) => projects.get(id));
  host.siteOps = async (projectId, op) =>
    op.op === 'fix'
      ? { op: 'fix', value: await fixes.call(projectId, op.call) }
      : sites.run(projectId, op);
  sites.onStatus = (status) => host.siteStatus(status);
  sites.onHeld = (projectId, held) => host.siteHeld(projectId, held);
  registerReplay(userData);
  const check = (method: 'dns' | 'file', domain: string, token: string) =>
    host.verifySite(method, domain, token);
  registerVerify(check);
  sites.recheck = (domain, verification) => recheck(domain, verification, check);
  new VoiceHost(
    (name) => secrets.get(name),
    (projectId, usage) => host.voiceUsage(projectId, usage),
  ).register();
  host.start();
  registerKeys(secrets, host);
  projects.register();
  sites.register();
  // Dev servers Fitts started never outlive it.
  app.on('before-quit', () => sites.closeAll());
  app.on('will-quit', () => sites.closeAll());
  process.on('exit', () => sites.closeAll());
  buildAppMenu();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
