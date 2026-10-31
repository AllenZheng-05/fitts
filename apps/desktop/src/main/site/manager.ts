// One live site per open project (SPEC-phase2 §4.1, §5): its dev server, its offscreen window,
// frames and status to the renderer, CDP-style queries, and step shots for rewind.
import {
  DEVICES,
  IPC,
  type Project,
  type SiteInput,
  type SiteNav,
  type SiteStatus,
  type SiteDevice,
  type SiteVersion,
  SCREEN_DEVICE,
} from '@fitts/schema';
import { BrowserWindow, ipcMain, nativeImage, screen, shell } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectProject, devCommandOnPort } from '../projects/detect';
import { runDir, SAFE_ID } from '../store/run-log';
import type { HeldRequest, SiteOp, SiteOpResult } from '../../agent/protocol';
import { DevServer, responds } from './dev-server';
import { captureReference } from './reference';
import { SiteWindow } from './site-window';

interface Live {
  server: DevServer;
  window?: SiteWindow;
  status: SiteStatus;
  health?: ReturnType<typeof setInterval>;
  /** A version (not the project's own site): frees its port when it closes. */
  release?: () => void;
}

/** Where versions of a site come from: the FixHost's worktrees and ports. */
export interface VersionSource {
  viewDir(projectId: string, runId: string, version: SiteVersion): Promise<string>;
  reservePort(): Promise<number>;
  releasePort(port: number): void;
}

const PATH = /^\/[^\s]{0,300}$/;
const BRANCH = /^fitts\/[\w./-]{1,120}$/;

/** "Your screen": a desktop browser the size of the display Fitts is on, in CSS px. */
function screenDevice(): SiteDevice {
  const { width, height } = screen.getPrimaryDisplay().size;
  return { id: SCREEN_DEVICE, label: 'Your screen', width, height, mobile: false };
}

const ASSET_NAME = /^[\w.-]+\.(jpg|png|svg)$/;

export class SiteManager {
  private readonly live = new Map<string, Live>();
  /** Status changes also go to the agent (site-down, live projects). */
  onStatus: ((status: SiteStatus) => void) | undefined;
  /** The ownership re-check before a live site opens (§4.2), set by main. */
  recheck:
    | ((
        domain: string,
        verification: Project['verification'],
      ) => Promise<{ ok: boolean; message: string }>)
    | undefined;
  /** A write from Fitts's action held for the gate goes to the agent (§13). */
  onHeld: ((projectId: string, held: HeldRequest) => void) | undefined;
  /** Worktrees and ports for versions of a site, set by main. */
  versions: VersionSource | undefined;

  constructor(
    private readonly root: string,
    private readonly projectFor: (id: string) => Project | undefined,
  ) {}

  private broadcast(channel: string, ...args: unknown[]) {
    for (const win of BrowserWindow.getAllWindows()) {
      const wc = win.webContents;
      // Site windows are BrowserWindows too; only the app window gets these.
      if (!wc.isDestroyed() && !wc.isOffscreen()) wc.send(channel, ...args);
    }
  }

  private status(projectId: string, patch: Partial<SiteStatus>) {
    const live = this.live.get(projectId);
    const status: SiteStatus = { ...(live?.status ?? { projectId, status: 'starting' }), ...patch };
    if (live) live.status = status;
    this.broadcast(IPC.siteStatus, status);
    // Versions are only for looking at; the agent never drives them.
    if (!live?.release) this.onStatus?.(status);
  }

  /**
   * A version of the project's site under its own id (versionSiteId): a fix's branch or the
   * run's preview, served from a worktree by its own dev server on a spare port. It's only
   * for the user to look at and use; Fitts never acts on it.
   */
  async openVersion(
    siteId: string,
    projectId: string,
    runId: string,
    version: SiteVersion,
  ): Promise<void> {
    if (!SAFE_ID.test(runId) || !siteId.startsWith(`${projectId}.v.`) || !SAFE_ID.test(siteId))
      return;
    const branches = version.kind === 'branch' ? [version.branch] : version.branches;
    if (!branches.every((b) => BRANCH.test(b))) return;
    if (this.live.has(siteId)) this.close(siteId);
    const project = this.projectFor(projectId);
    const source = this.versions;
    if (project?.kind !== 'local' || !source) {
      this.broadcast(IPC.siteStatus, {
        projectId: siteId,
        status: 'unavailable',
      } satisfies SiteStatus);
      return;
    }
    const port = await source.reservePort();
    const live: Live = {
      server: new DevServer('', '', port),
      status: { projectId: siteId, status: 'starting' },
      release: () => source.releasePort(port),
    };
    this.live.set(siteId, live);
    this.status(siteId, { status: 'starting' });
    let dir: string;
    try {
      dir = await source.viewDir(projectId, runId, version);
    } catch (e) {
      if (this.live.get(siteId) === live)
        this.status(siteId, { status: 'failed', log: [(e as Error).message] });
      return;
    }
    if (this.live.get(siteId) !== live) return;
    live.server = new DevServer(dir, devCommandOnPort(dir, port), port);
    this.status(siteId, { url: live.server.url });
    const ok = await live.server.start(90_000);
    if (!ok || this.live.get(siteId) !== live) {
      if (this.live.get(siteId) === live)
        this.status(siteId, { status: 'failed', log: live.server.log });
      else live.server.stop();
      return;
    }
    const win = new SiteWindow(
      siteId,
      live.server.url,
      (jpeg, w, h) => this.broadcast(IPC.siteFrame, siteId, jpeg, w, h),
      (patch) => this.status(siteId, patch),
    );
    live.window = win;
    const detection = await detectProject(dir);
    const path = version.path && PATH.test(version.path) ? version.path : undefined;
    await win.load(path ?? project.startPath ?? detection?.startPath ?? '/').catch(() => undefined);
    this.status(siteId, { status: 'running' });
  }

  async open(projectId: string): Promise<void> {
    if (!SAFE_ID.test(projectId)) return;
    const existing = this.live.get(projectId);
    if (existing) {
      this.broadcast(IPC.siteStatus, existing.status);
      return;
    }
    const project = this.projectFor(projectId);
    if (project?.kind === 'live') return this.openLive(projectId, project);
    const folder = project?.kind === 'local' ? project.folder : undefined;
    if (!project || !folder || !existsSync(folder)) {
      this.broadcast(IPC.siteStatus, { projectId, status: 'unavailable' } satisfies SiteStatus);
      return;
    }
    const detection = await detectProject(folder);
    const forced = Number(process.env['FITTS_SITE_PORT'] ?? '');
    const port = forced || detection?.port || 5173;
    // The detected command is made to serve on `port`; one the user typed is used as written.
    const custom = project.devCommand && project.devCommand !== detection?.devCommand;
    const server = new DevServer(
      folder,
      custom ? (project.devCommand ?? '') : devCommandOnPort(folder, port),
      port,
    );
    const live: Live = { server, status: { projectId, status: 'starting' } };
    this.live.set(projectId, live);
    this.status(projectId, { status: 'starting', url: server.url });

    const ok = await server.start();
    if (!ok || this.live.get(projectId) !== live) {
      this.status(projectId, { status: 'failed', log: server.log });
      return;
    }
    const win = new SiteWindow(
      projectId,
      server.url,
      (jpeg, w, h) => this.broadcast(IPC.siteFrame, projectId, jpeg, w, h),
      (patch) => this.status(projectId, patch),
      (held) => this.onHeld?.(projectId, held),
    );
    live.window = win;
    await win.load(project.startPath ?? detection?.startPath ?? '/').catch(() => undefined);
    this.status(projectId, { status: 'running' });
    this.watch(projectId, live);
  }

  /** Health check every 3s; three misses in a row is "site down" (§4.1, §6.3). */
  private watch(projectId: string, live: Live): void {
    let misses = 0;
    live.health = setInterval(() => {
      void responds(live.server.url).then((up) => {
        if (this.live.get(projectId) !== live) return;
        misses = up ? 0 : misses + 1;
        if (misses === 3) this.status(projectId, { status: 'failed', log: live.server.log });
        if (up && live.status.status === 'failed') this.status(projectId, { status: 'running' });
      });
    }, 3000);
  }

  /** Restart (the site-down card's "Restart server"). */
  async restart(projectId: string): Promise<boolean> {
    const live = this.live.get(projectId);
    if (!live) return false;
    const ok = await live.server.restart();
    if (ok) {
      live.window?.wc.reload();
      this.status(projectId, { status: 'running' });
    } else this.status(projectId, { status: 'failed', log: live.server.log });
    return ok;
  }

  /** A crawler operation for the agent (§6.1); every one is gated in P8. */
  async run(projectId: string, request: SiteOp): Promise<SiteOpResult> {
    const live = this.live.get(projectId);
    if (request.op === 'restart') return { op: 'restart', up: await this.restart(projectId) };
    if (request.op === 'health') {
      const up = live ? await responds(live.server.url) : false;
      return { op: 'health', up, log: live?.server.log ?? [] };
    }
    if (request.op === 'png' || request.op === 'saveAsset') return this.media(projectId, request);
    if (request.op === 'reference')
      return { op: 'reference', ...(await captureReference(request.url)) };
    const win = live?.window;
    if (!win) throw new Error('The site is not running');
    switch (request.op) {
      case 'snapshot':
        return { op: 'snapshot', snapshot: await win.snapshot() };
      case 'screenshot': {
        const jpeg = await win.capture();
        const [width, height] = win.win.getContentSize();
        return {
          op: 'screenshot',
          jpegBase64: jpeg.toString('base64'),
          width: width ?? 0,
          height: height ?? 0,
        };
      }
      case 'navigate':
        return win.goto(request.path);
      case 'click':
        return win.click(request.ref, request.destructive ?? false);
      case 'type':
        return win.type(request.ref, request.text);
      case 'press':
        return win.press(request.key);
      case 'back':
        return win.back();
      case 'probes':
        return { op: 'probes', results: await win.runProbes(request.names) };
      case 'focus':
        return { op: 'items', items: await win.focusSweep() };
      case 'viewport':
        return { op: 'items', items: await win.viewportSweep() };
      case 'device': {
        const previous = win.device?.id ?? null;
        await win.emulate(DEVICES.find((d) => d.id === request.id) ?? null);
        return { op: 'device', previous };
      }
      case 'value':
        return { op: 'value', value: await win.value(request.ref) };
      case 'links':
        return { op: 'links', statuses: await win.links(request.hrefs) };
      case 'network':
        return { op: 'network', requests: win.drainNetwork() };
      case 'release':
        await win.release(request.id, request.allow);
        return { op: 'released' };
      case 'fix':
        throw new Error('Fix calls go to the FixHost');
      case 'rects':
        return { op: 'rects', rects: await win.rects(request.refs) };
      case 'reveal':
        await win.reveal(request.ref).catch(() => undefined);
        return { op: 'revealed' };
    }
  }

  /**
   * A live site (§4.2: audit-only): no dev server, and never opened until its ownership is
   * re-checked. The window only follows the verified origin.
   */
  private async openLive(projectId: string, project: Project): Promise<void> {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//.test(project.url) ? project.url : `https://${project.url}`);
    } catch {
      this.broadcast(IPC.siteStatus, { projectId, status: 'unavailable' } satisfies SiteStatus);
      return;
    }
    const server = new DevServer('', '', 0);
    const live: Live = { server, status: { projectId, status: 'starting' } };
    this.live.set(projectId, live);
    this.status(projectId, { status: 'starting', url: url.origin });
    const ok = (await this.recheck?.(url.hostname, project.verification)) ?? {
      ok: false,
      message: '',
    };
    if (this.live.get(projectId) !== live) return;
    if (!ok.ok) {
      this.status(projectId, {
        status: 'failed',
        log: [ok.message || 'Ownership couldn’t be confirmed.'],
      });
      return;
    }
    const win = new SiteWindow(
      projectId,
      url.origin,
      (jpeg, w, h) => this.broadcast(IPC.siteFrame, projectId, jpeg, w, h),
      (patch) => this.status(projectId, patch),
      (held) => this.onHeld?.(projectId, held),
    );
    live.window = win;
    await win.load(url.pathname || '/').catch(() => undefined);
    this.status(projectId, { status: 'running' });
  }

  close(projectId: string): void {
    const live = this.live.get(projectId);
    if (!live) return;
    if (live.health) clearInterval(live.health);
    live.window?.destroy();
    live.server.stop();
    live.release?.();
    this.live.delete(projectId);
  }

  /** Every version of a project's site (a run is finished; its worktrees go). */
  closeVersions(projectId: string): void {
    for (const id of [...this.live.keys()]) if (id.startsWith(`${projectId}.v.`)) this.close(id);
  }

  closeAll(): void {
    for (const id of [...this.live.keys()]) this.close(id);
  }

  window(projectId: string): SiteWindow | undefined {
    return this.live.get(projectId)?.window;
  }

  private media(
    projectId: string,
    request: Extract<SiteOp, { op: 'png' | 'saveAsset' }>,
  ): SiteOpResult {
    if (request.op === 'png')
      return {
        op: 'png',
        pngBase64: nativeImage
          .createFromBuffer(Buffer.from(request.jpegBase64, 'base64'))
          .toPNG()
          .toString('base64'),
      };
    return {
      op: 'saved',
      url: this.saveAsset(projectId, request.runId, request.name, request.base64),
    };
  }

  /** Writes runs/<runId>/assets/<name> (SAM outlines, mockups, route shots; §10, §12.3). */
  saveAsset(projectId: string, runId: string, name: string, base64: string): string {
    if (!SAFE_ID.test(projectId) || !SAFE_ID.test(runId) || !ASSET_NAME.test(name))
      throw new Error('bad asset name');
    const dir = join(runDir(this.root, projectId, runId), 'assets');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), Buffer.from(base64, 'base64'));
    return `fitts-asset://${projectId}/${runId}/assets/${name}`;
  }

  /** Saves the page as it is now as runs/<runId>/shots/<step>.jpg (rewind, §5.4). */
  async shot(projectId: string, runId: string, step: number): Promise<void> {
    const win = this.window(projectId);
    if (!win) return;
    try {
      const dir = join(runDir(this.root, projectId, runId), 'shots');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${step}.jpg`), await win.capture());
    } catch {
      // A shot is best effort; rewind falls back to the live view.
    }
  }

  register(): void {
    ipcMain.handle(IPC.siteDetect, (_e, folder: unknown) =>
      typeof folder === 'string' && folder ? detectProject(folder) : null,
    );
    ipcMain.on(IPC.siteOpen, (_e, id: unknown) => {
      if (typeof id === 'string') void this.open(id);
    });
    ipcMain.on(IPC.siteClose, (_e, id: unknown) => {
      if (typeof id === 'string') this.close(id);
    });
    // Only a page on a dev server on this computer: the URL comes from main, not the renderer.
    ipcMain.on(IPC.siteOpenInBrowser, (_e, id: unknown) => {
      const live = typeof id === 'string' ? this.live.get(id) : undefined;
      const url = live?.status.url ?? live?.server.url;
      if (url && /^http:\/\/localhost:\d+(\/|$)/.test(url)) void shell.openExternal(url);
    });
    ipcMain.on(
      IPC.siteOpenVersion,
      (_e, siteId: unknown, projectId: unknown, runId: unknown, version: unknown) => {
        const v = version as SiteVersion | null;
        const ok =
          typeof siteId === 'string' &&
          typeof projectId === 'string' &&
          typeof runId === 'string' &&
          v !== null &&
          typeof v === 'object' &&
          ((v.kind === 'branch' && typeof v.branch === 'string') ||
            (v.kind === 'preview' &&
              Array.isArray(v.branches) &&
              v.branches.every((b) => typeof b === 'string')));
        if (ok) void this.openVersion(siteId, projectId, runId, v);
      },
    );
    ipcMain.on(IPC.siteResize, (_e, id: unknown, w: unknown, h: unknown) => {
      if (typeof id === 'string' && typeof w === 'number' && typeof h === 'number')
        this.window(id)?.resize(w, h);
    });
    // Only a device Fitts offers, by id: the renderer never sets arbitrary emulation.
    ipcMain.on(IPC.siteDevice, (_e, id: unknown, deviceId: unknown) => {
      if (typeof id !== 'string') return;
      const device =
        deviceId === SCREEN_DEVICE
          ? screenDevice()
          : (DEVICES.find((d) => d.id === deviceId) ?? null);
      void this.window(id)
        ?.emulate(device)
        .catch(() => undefined);
    });
    ipcMain.on(IPC.siteInput, (_e, id: unknown, input: SiteInput) => {
      if (typeof id === 'string' && input && typeof input === 'object')
        this.window(id)?.input(input);
    });
    ipcMain.on(IPC.siteNav, (_e, id: unknown, nav: SiteNav) => {
      if (typeof id === 'string' && nav && typeof nav === 'object') this.window(id)?.nav(nav);
    });
    ipcMain.handle(IPC.siteRects, async (_e, id: unknown, refs: unknown) => {
      const win = typeof id === 'string' ? this.window(id) : undefined;
      if (!win || !Array.isArray(refs)) return {};
      return win.rects(refs.filter((r): r is string => typeof r === 'string')).catch(() => ({}));
    });
    ipcMain.handle(IPC.siteElementAt, async (_e, id: unknown, x: unknown, y: unknown) => {
      const win = typeof id === 'string' ? this.window(id) : undefined;
      if (!win || typeof x !== 'number' || typeof y !== 'number') return null;
      return win.elementAt(x, y).catch(() => null);
    });
    ipcMain.handle(IPC.siteRefAt, async (_e, id: unknown, x: unknown, y: unknown) => {
      const win = typeof id === 'string' ? this.window(id) : undefined;
      if (!win || typeof x !== 'number' || typeof y !== 'number') return null;
      return win.refAt(x, y).catch(() => null);
    });
  }
}
