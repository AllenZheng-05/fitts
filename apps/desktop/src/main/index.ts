import { IPC } from '@fitts/schema';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'node:path';
import { handleAssets, registerAssetScheme } from './asset-protocol';
import { registerBridge } from './bridge';
import { registerKeys } from './keys-ipc';
import { buildAppMenu } from './menu';
import { RunHost } from './run-host';
import { Secrets } from './secrets';
import { FixHost } from './fix/fix-host';
import { FontStore } from './fonts/fonts';
import { saveBoard } from './site/board';
import { VoiceHost } from './voice';
import { registerTools } from './tools';
import { githubPages, recheck, registerVerify } from './verify-site';
import { createGitHub, registerGitHub } from './github';
import { SiteManager } from './site/manager';
import { ProjectStore } from './store/projects';
import { SAFE_ID } from './store/run-log';
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
  const github = createGitHub(secrets);
  registerGitHub(github);
  const fonts = new FontStore(join(userData, 'fonts'));
  const fixes = new FixHost(
    (id) => projects.get(id),
    () => github.prs(),
    {
      fonts,
      vendorDir: app.isPackaged
        ? join(process.resourcesPath, 'vendor')
        : join(__dirname, '../../resources/vendor'),
      pluginFile: app.isPackaged
        ? join(process.resourcesPath, 'plugin', 'fitts.vite.mjs')
        : join(__dirname, '../../resources/plugin/fitts.vite.mjs'),
    },
  );
  host.siteOps = async (projectId, op) =>
    op.op === 'fix'
      ? { op: 'fix', value: await fixes.call(projectId, op.call) }
      : op.op === 'board'
        ? { op: 'saved', url: await saveBoard(sites, fonts, projectId, op) }
        : sites.run(projectId, op);
  sites.onStatus = (status) => host.siteStatus(status);
  sites.versions = fixes;
  sites.pluginFile = app.isPackaged
    ? join(process.resourcesPath, 'plugin', 'fitts.vite.mjs')
    : join(__dirname, '../../resources/plugin/fitts.vite.mjs');
  ipcMain.handle(IPC.runFinish, async (_e, projectId: unknown, runId: unknown) => {
    if (typeof projectId !== 'string' || typeof runId !== 'string' || !SAFE_ID.test(runId)) return;
    sites.closeVersions(projectId);
    await fixes.finish(projectId, runId).catch(() => undefined);
  });
  sites.onHeld = (projectId, held) => host.siteHeld(projectId, held);
  registerTools(() =>
    github.signedIn() ? (github.auth.status() as { login?: string }).login : undefined,
  );
  const check = (method: 'dns' | 'file', domain: string, token: string) =>
    host.verifySite(method, domain, token);
  // GitHub Pages: through the sign-in when there is one, else the gh CLI.
  const pages = () =>
    github.signedIn()
      ? github.api
          .pagesSites()
          .then((sites) => ({ sites }))
          .catch((e: unknown) => ({ error: (e as Error).message }))
      : githubPages();
  registerVerify(check, pages, secrets);
  sites.recheck = (domain, verification) => recheck(domain, verification, check, pages, secrets);
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
