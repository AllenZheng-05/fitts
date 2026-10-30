// One live site per open project (SPEC-phase2 §4.1, §5): its dev server, its offscreen window,
// frames and status to the renderer, CDP-style queries, and step shots for rewind.
import { IPC, type Project, type SiteInput, type SiteNav, type SiteStatus } from '@fitts/schema';
import { BrowserWindow, ipcMain } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectProject } from '../projects/detect';
import { runDir, SAFE_ID } from '../store/run-log';
import type { HeldRequest, SiteOp, SiteOpResult } from '../../agent/protocol';
import { DevServer, responds } from './dev-server';
import { SiteWindow } from './site-window';

interface Live {
  server: DevServer;
  window?: SiteWindow;
  status: SiteStatus;
  health?: ReturnType<typeof setInterval>;
}

export class SiteManager {
  private readonly live = new Map<string, Live>();
  /** Status changes also go to the agent (site-down, live projects). */
  onStatus: ((status: SiteStatus) => void) | undefined;
  /** A write from Fitts's action held for the gate goes to the agent (§13). */
  onHeld: ((projectId: string, held: HeldRequest) => void) | undefined;

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
    this.onStatus?.(status);
  }

  async open(projectId: string): Promise<void> {
    if (!SAFE_ID.test(projectId)) return;
    const existing = this.live.get(projectId);
    if (existing) {
      this.broadcast(IPC.siteStatus, existing.status);
      return;
    }
    const project = this.projectFor(projectId);
    const folder = project?.kind === 'local' ? project.folder : undefined;
    if (!project || !folder || !existsSync(folder)) {
      this.broadcast(IPC.siteStatus, { projectId, status: 'unavailable' } satisfies SiteStatus);
      return;
    }
    const detection = await detectProject(folder);
    const forced = Number(process.env['FITTS_SITE_PORT'] ?? '');
    const port = forced || detection?.port || 5173;
    const server = new DevServer(
      folder,
      project.devCommand ?? detection?.devCommand ?? 'npm run dev',
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
      case 'value':
        return { op: 'value', value: await win.value(request.ref) };
      case 'links':
        return { op: 'links', statuses: await win.links(request.hrefs) };
      case 'network':
        return { op: 'network', requests: win.drainNetwork() };
      case 'release':
        await win.release(request.id, request.allow);
        return { op: 'released' };
    }
  }

  close(projectId: string): void {
    const live = this.live.get(projectId);
    if (!live) return;
    if (live.health) clearInterval(live.health);
    live.window?.destroy();
    live.server.stop();
    this.live.delete(projectId);
  }

  closeAll(): void {
    for (const id of [...this.live.keys()]) this.close(id);
  }

  window(projectId: string): SiteWindow | undefined {
    return this.live.get(projectId)?.window;
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
    ipcMain.on(IPC.siteResize, (_e, id: unknown, w: unknown, h: unknown) => {
      if (typeof id === 'string' && typeof w === 'number' && typeof h === 'number')
        this.window(id)?.resize(w, h);
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
