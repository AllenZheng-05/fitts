// One live site per open project (SPEC-phase2 §4.1, §5): its dev server, its offscreen window,
// frames and status to the renderer, CDP-style queries, and step shots for rewind.
import {
  type DeviceCell,
  DEVICES,
  IPC,
  type Project,
  type SiteInput,
  type SiteNav,
  type SiteStatus,
  type SiteDevice,
  type SiteVersion,
  type SourceFrame,
  SCREEN_DEVICE,
} from '@fitts/schema';
import { BrowserWindow, ipcMain, nativeImage, screen, shell, type WebContents } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectProject, devCommandOnPort, hasWebBuild } from '../projects/detect';
import { runDir, SAFE_ID } from '../store/run-log';
import type { HeldRequest, SiteOp, SiteOpResult } from '../../agent/protocol';
import { DevServer, METRO_HEALTH, responds } from './dev-server';
import { captureReference } from './reference';
import { SiteWindow } from './site-window';
import { EVENT_SIDE_MS, FrameRing } from './frames';
import { Adb, adbRunner, bootEmulator, findTool, readAppJson } from '../android/adb';
import { PhoneSwitch } from '../android/phone-switch';
import { AndroidWindow } from '../android/window';
import { extract } from '../understand/extract';
import { replay } from './replayer';
import { measurePerf } from './perf';
import { mapDebugSrc } from './source-chain';
import { hostOf, SITE_TAB, TabSet } from './tabs';

interface Live {
  server: DevServer;
  window?: SiteWindow;
  /** SPEC-phase4 §9.2: an Android project's device, in place of the window. */
  android?: AndroidWindow;
  /** The emulator between the live app and the run's fixed version (Allen, Nov 2). */
  phone?: PhoneSwitch;
  status: SiteStatus;
  health?: ReturnType<typeof setInterval>;
  /** A version (not the project's own site): frees its port when it closes. */
  release?: () => void;
  /** Tabs beside the site (SPEC-phase3 §3), and the site tab's own address while one shows. */
  tabs?: TabSet;
  siteNav?: Partial<SiteStatus>;
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

/** A device Fitts offers, by id ("Your screen" is measured here); null for anything else. */
function deviceById(id: string | null): SiteDevice | null {
  if (id === SCREEN_DEVICE) return screenDevice();
  return DEVICES.find((d) => d.id === id) ?? null;
}

const ASSET_NAME = /^[\w.-]+\.(jpg|png|svg|html)$/;

export class SiteManager {
  private readonly live = new Map<string, Live>();
  /** Each site window's recent frames (SPEC-phase4 §6B.5). */
  private readonly rings = new Map<string, FrameRing>();
  /** SPEC-phase4 §6.3: each project's device cells from its last run, by id. */
  private readonly cells = new Map<string, Map<string, DeviceCell>>();

  private cellsOf(projectId: string): Map<string, DeviceCell> {
    let map = this.cells.get(projectId);
    if (!map) {
      map = new Map();
      this.cells.set(projectId, map);
    }
    return map;
  }

  /** A device Fitts offers, or one of the run's cells, by id. */
  private deviceFor(projectId: string, id: string | null): SiteDevice | DeviceCell | null {
    return deviceById(id) ?? (id ? (this.cells.get(projectId)?.get(id) ?? null) : null);
  }
  /** Whether the agent is using a project's emulator (mid-run): the fixed version waits. */
  phoneBusy: ((projectId: string) => boolean) | undefined;
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
  /** The Fitts plugin, added to Vite dev servers from outside the project (set by main). */
  pluginFile: string | undefined;
  /** A local project is being opened (SPEC-phase4 §3: Understand starts in the background). */
  onOpen: ((projectId: string) => void) | undefined;

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
    if (!BRANCH.test(version.branch)) return;
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
    // An Android app's version: its web build at phone width, never the phone itself (the agent
    // and its checks use the one emulator). Without a web build there's nothing to show.
    const android = (await detectProject(project.folder ?? ''))?.platform === 'android';
    if (android && !hasWebBuild(project.folder ?? '')) {
      this.broadcast(IPC.siteStatus, {
        projectId: siteId,
        status: 'unavailable',
        androidWeb: 'missing',
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
    live.server = new DevServer(
      dir,
      android
        ? `npx expo start --web --port ${port}`
        : devCommandOnPort(dir, port, this.pluginFile),
      port,
      android ? METRO_HEALTH : undefined,
    );
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
      (jpeg, w, h) => this.siteFrame(siteId, jpeg, w, h),
      (patch) => this.sitePatch(siteId, patch),
    );
    live.window = win;
    this.attachTabs(siteId, live, win, new URL(live.server.url).origin);
    const detection = await detectProject(dir);
    const path = version.path && PATH.test(version.path) ? version.path : undefined;
    if (android) await win.emulate(deviceById('android')).catch(() => undefined);
    await win.load(path ?? project.startPath ?? detection?.startPath ?? '/').catch(() => undefined);
    this.status(siteId, {
      status: 'running',
      ...(android ? { androidWeb: 'imitation' as const, device: 'android' } : {}),
    });
  }

  async open(projectId: string): Promise<void> {
    if (!SAFE_ID.test(projectId)) return;
    const existing = this.live.get(projectId);
    if (existing) {
      this.broadcast(IPC.siteStatus, existing.status);
      return;
    }
    const project = this.projectFor(projectId);
    if (project) this.onOpen?.(projectId);
    if (project?.kind === 'live') return this.openLive(projectId, project);
    const folder = project?.kind === 'local' ? project.folder : undefined;
    if (!project || !folder || !existsSync(folder)) {
      this.broadcast(IPC.siteStatus, { projectId, status: 'unavailable' } satisfies SiteStatus);
      return;
    }
    const detection = await detectProject(folder);
    if (detection?.platform === 'android') return this.openAndroid(projectId, folder);
    const forced = Number(process.env['FITTS_SITE_PORT'] ?? '');
    const port = forced || detection?.port || 5173;
    // The detected command is made to serve on `port`; one the user typed is used as written.
    const custom = project.devCommand && project.devCommand !== detection?.devCommand;
    const server = new DevServer(
      folder,
      custom ? (project.devCommand ?? '') : devCommandOnPort(folder, port, this.pluginFile),
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
      (jpeg, w, h) => this.siteFrame(projectId, jpeg, w, h),
      (patch) => this.sitePatch(projectId, patch),
      (held) => this.onHeld?.(projectId, held),
    );
    live.window = win;
    this.attachTabs(projectId, live, win, new URL(server.url).origin);
    await win.load(project.startPath ?? detection?.startPath ?? '/').catch(() => undefined);
    this.status(projectId, { status: 'running' });
    this.watch(projectId, live);
  }

  /**
   * SPEC-phase4 §9.2: an Expo app on Android. adb and a device (the first AVD is booted when none
   * is running), Metro on its port, `adb reverse` so the device reaches it, then the dev client
   * opened on Metro's URL. Every site operation for the project goes to the AndroidWindow.
   */
  private async openAndroid(projectId: string, folder: string): Promise<void> {
    const fail = (line: string) => this.status(projectId, { status: 'failed', log: [line] });
    const adbPath = findTool('adb');
    if (!adbPath)
      return fail('The Android SDK isn’t installed here (no adb on ANDROID_HOME or PATH).');
    let serial = (await new Adb(adbRunner(adbPath)).devices())[0];
    if (!serial) {
      this.status(projectId, { status: 'starting', url: 'android:emulator' });
      serial = await bootEmulator(adbPath);
      if (!serial) return fail('No Android emulator is running and none could be started.');
    }
    const adb = new Adb(adbRunner(adbPath, serial));
    const app = readAppJson(folder);
    const port = Number(process.env['FITTS_SITE_PORT'] ?? '') || 8081;
    const server = new DevServer(
      folder,
      `npx expo start --dev-client --port ${port}`,
      port,
      METRO_HEALTH,
    );
    const live: Live = { server, status: { projectId, status: 'starting' } };
    this.live.set(projectId, live);
    this.status(projectId, { status: 'starting', url: `android:${serial}` });
    if (!(await server.start(120_000)) || this.live.get(projectId) !== live) {
      this.status(projectId, { status: 'failed', log: server.log });
      return;
    }
    await adb.reverse(port);
    const metro = encodeURIComponent(`http://127.0.0.1:${port}`);
    await adb.open(`exp+${app.slug}://expo-development-client/?url=${metro}`);
    const win = new AndroidWindow(
      adb,
      (jpeg, w, h) => this.siteFrame(projectId, jpeg, w, h),
      (patch) => this.sitePatch(projectId, patch),
      (held) => this.onHeld?.(projectId, held),
      {
        ...(app.scheme ? { scheme: app.scheme } : {}),
        ...(app.appId ? { appId: app.appId } : {}),
        // The screens and their header titles (Pass 1 reads them from the layouts).
        screens: extract(folder, 'android').pages.map((p) => ({
          route: p.route,
          ...(p.title ? { title: p.title } : {}),
        })),
      },
    );
    live.android = win;
    const versions = this.versions;
    live.phone = new PhoneSwitch(
      {
        adb: () => Promise.resolve(adb),
        slug: app.slug,
        livePort: port,
        metro: (dir, p) => {
          const server = new DevServer(
            dir,
            `npx expo start --dev-client --port ${p}`,
            p,
            METRO_HEALTH,
            false,
          );
          return {
            start: (ms) => server.start(ms),
            stop: () => server.stop(),
            served: () => server.printed(/Bundled/),
          };
        },
        freePort: () => versions?.reservePort() ?? Promise.reject(new Error('no ports')),
        releasePort: (p) => versions?.releasePort(p),
      },
      (showing) =>
        this.status(projectId, {
          fixedBranch: showing.kind === 'fixed' ? showing.branch : undefined,
        }),
    );
    await win.start();
    await win.ready();
    this.status(projectId, { status: 'running' });
    this.watch(projectId, live);
  }

  /** Health check every 3s; three misses in a row is "site down" (§4.1, §6.3). */
  private watch(projectId: string, live: Live): void {
    let misses = 0;
    live.health = setInterval(() => {
      // 4s, not 1.5: under load a dev server answers slowly without being down.
      void responds(live.server.healthUrl, 4000).then((up) => {
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
    // A live site has no server to restart: load the page again.
    if (this.projectFor(projectId)?.kind === 'live') {
      const up = (await live.window?.reloadAndCheck()) ?? false;
      this.status(projectId, { status: up ? 'running' : 'failed' });
      return up;
    }
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
      const up = !live
        ? false
        : this.projectFor(projectId)?.kind === 'live'
          ? ((await live.window?.responsive()) ?? false)
          : await responds(live.server.healthUrl);
      return { op: 'health', up, log: live?.server.log ?? [] };
    }
    if (request.op === 'png' || request.op === 'saveAsset') return this.media(projectId, request);
    if (request.op === 'reference')
      return { op: 'reference', ...(await captureReference(request.url)) };
    if (live?.android && request.op !== 'board') {
      // The agent works on the live app: a fixed version on the phone goes first.
      if (live.phone?.state().kind === 'fixed') await live.phone.showLive();
      return live.android.run(request);
    }
    // Boards need the font store: main/index answers them before they get here.
    if (request.op === 'board') throw new Error('boards are saved by main');
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
        // The device by its id, "Your screen" included, so the previous one restores exactly.
        const previous = win.deviceKey;
        await win.emulate(this.deviceFor(projectId, request.id));
        // The picker shows what Fitts is looking at.
        this.status(projectId, { device: request.id ?? SCREEN_DEVICE });
        return { op: 'device', previous };
      }
      case 'cell': {
        // SPEC-phase4 §6.3: a device cell; remembered by id so the picker and replayer find it.
        const previous = win.deviceKey;
        if (request.cell) this.cellsOf(projectId).set(request.cell.id, request.cell);
        await win.emulate(request.cell);
        this.status(projectId, { device: request.cell?.id ?? SCREEN_DEVICE });
        return { op: 'device', previous };
      }
      case 'cells': {
        const map = this.cellsOf(projectId);
        for (const c of request.cells) map.set(c.id, c);
        return { op: 'ok' };
      }
      case 'breakpoints':
        return { op: 'breakpoints', media: await win.breakpoints() };
      case 'keyboard': {
        const k = await win.keyboardSweep();
        return { op: 'keyboard', stops: k.stops, facts: k.facts };
      }
      case 'dialog':
        return { op: 'dialog', check: await win.dialogCheck() };
      case 'facts':
        return { op: 'facts', facts: await win.facts(request.path) };
      case 'surprise': {
        const s = await win.surpriseEvents();
        return {
          op: 'surprise',
          events: s.events,
          inputs: s.inputs,
          ...(s.clock !== undefined ? { clock: s.clock } : {}),
        };
      }
      case 'frames': {
        // The 2 s after the event have to have been painted first.
        const wait = Math.min(EVENT_SIDE_MS + 250, request.at + EVENT_SIDE_MS + 150 - Date.now());
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        const ring = this.rings.get(projectId);
        return {
          op: 'frames',
          frames: (ring?.around(request.at) ?? []).map((f) => ({
            at: f.at,
            jpegBase64: f.jpeg.toString('base64'),
            width: f.width,
            height: f.height,
          })),
        };
      }
      case 'fault': {
        // Never on a live site: rewriting responses is for the project's own dev server.
        if (!live.server.url) throw new Error('state checks run on local projects only');
        const r = await win.faultLoad(request.route, request.endpoint, request.fault);
        return { op: 'fault', ...r };
      }
      case 'perf': {
        const pages = await Promise.race([
          measurePerf(projectId, live.server.url || win.wc.getURL(), request.routes),
          // Never hold up the run on a slow measurement (§6B.7).
          new Promise<[]>((r) => setTimeout(() => r([]), 150_000)),
        ]);
        return { op: 'perf', pages };
      }
      case 'cellProbes':
        return { op: 'probes', results: await win.cellProbes(request.cell) };
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
      case 'replay': {
        // A second hidden window on the same server and session (SPEC-phase4 §5.2).
        const device = this.deviceFor(projectId, request.ask.start.device ?? null);
        const answer = await replay(
          projectId,
          live.server.url || win.wc.getURL(),
          device,
          request.ask,
        );
        return { op: 'replayed', answer };
      }
      case 'source':
      case 'sources': {
        // Debug frames name dev-server URLs; main knows the origin and the project folder, so
        // it maps them to project paths (best effort) before the agent sees them.
        const origin = new URL(live.server.url || live.status.url || 'http://localhost').origin;
        const folder = this.projectFor(projectId)?.folder;
        const map = (frames: SourceFrame[]) =>
          frames.map((f) =>
            f.kind === 'debug' && f.src ? { ...f, src: mapDebugSrc(f.src, origin, folder) } : f,
          );
        if (request.op === 'source')
          return { op: 'source', frames: map(await win.sourceOf(request.ref).catch(() => [])) };
        const chains = await win.sourcesOf(request.refs).catch(() => ({}));
        return {
          op: 'sources',
          chains: Object.fromEntries(Object.entries(chains).map(([k, v]) => [k, map(v)])),
        };
      }
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
      (jpeg, w, h) => this.siteFrame(projectId, jpeg, w, h),
      (patch) => this.sitePatch(projectId, patch),
      (held) => this.onHeld?.(projectId, held),
    );
    live.window = win;
    this.attachTabs(projectId, live, win, url.origin);
    await win.load(url.pathname || '/').catch(() => undefined);
    this.status(projectId, { status: 'running' });
  }

  /**
   * The run branch's fixed version on the emulator (Allen, Nov 2), when the agent isn't using
   * it. When it can't be, the status says why and the site view shows the web imitation.
   */
  async showFixed(projectId: string, runId: string, branch: string): Promise<void> {
    const live = this.live.get(projectId);
    const fallback = (why: NonNullable<SiteStatus['phoneFallback']>) =>
      this.status(projectId, { phoneFallback: why });
    // Only an Android project has a phone; one whose emulator never came up gets the imitation.
    if (!live?.status.url?.startsWith('android:')) return;
    if (!live.android || !live.phone) return fallback('no-emulator');
    if (this.phoneBusy?.(projectId)) return fallback('busy');
    if (!this.versions || !SAFE_ID.test(runId) || !BRANCH.test(branch)) return;
    this.status(projectId, { phoneFallback: undefined });
    let dir: string;
    try {
      dir = await this.versions.viewDir(projectId, runId, { kind: 'branch', branch });
    } catch {
      return fallback('metro');
    }
    const r = await live.phone.showFixed(dir, branch);
    if (!r.ok) fallback(r.reason);
  }

  /** Back to the live app on the emulator (a no-op when it's showing). */
  async showLive(projectId: string): Promise<void> {
    const live = this.live.get(projectId);
    await live?.phone?.showLive();
    if (live?.status.phoneFallback) this.status(projectId, { phoneFallback: undefined });
  }

  /** Every emulator back on its live app (quitting Fitts). */
  async restorePhones(): Promise<void> {
    await Promise.all([...this.live.values()].map((l) => l.phone?.showLive() ?? Promise.resolve()));
  }

  /** Whether a phone is showing a fixed version (quitting waits for it to go back). */
  phoneShowingFixed(): boolean {
    return [...this.live.values()].some((l) => l.phone?.state().kind === 'fixed');
  }

  close(projectId: string): void {
    const live = this.live.get(projectId);
    if (!live) return;
    // Back to the live app on the phone; it finishes on its own.
    void live.phone?.showLive();
    if (live.health) clearInterval(live.health);
    live.tabs?.destroy();
    live.window?.destroy();
    live.android?.stop();
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

  /** The site's own tab is showing (overlays and pointing only ever apply there). */
  private onSite(id: string): boolean {
    const tabs = this.live.get(id)?.tabs;
    return !tabs || tabs.active === SITE_TAB;
  }

  /** The site's own frames show only while its tab does (SPEC-phase3 §3). */
  private siteFrame(id: string, jpeg: Buffer, w: number, h: number): void {
    // SPEC-phase4 §6B.5: the last 4 s at about 8 fps, for the surprise judge.
    let ring = this.rings.get(id);
    if (!ring) {
      ring = new FrameRing();
      this.rings.set(id, ring);
    }
    ring.push({ at: Date.now(), jpeg, width: w, height: h });
    const tabs = this.live.get(id)?.tabs;
    if (!tabs || tabs.active === SITE_TAB) this.broadcast(IPC.siteFrame, id, jpeg, w, h);
  }

  /** The site tab's address and cursor wait while another tab shows; the rest passes. */
  private sitePatch(id: string, patch: Partial<SiteStatus>): void {
    const live = this.live.get(id);
    if (!live?.tabs || live.tabs.active === SITE_TAB) return this.status(id, patch);
    const { url, canBack, canForward, cursor, ...rest } = patch;
    const nav = { url, canBack, canForward, cursor };
    for (const [k, v] of Object.entries(nav))
      if (v !== undefined) live.siteNav = { ...live.siteNav, [k]: v };
    if (Object.keys(rest).length > 0) this.status(id, rest);
  }

  /** Each site window gets its tabs; a link out of the site from your click opens one. */
  private attachTabs(id: string, live: Live, win: SiteWindow, origin: string): void {
    const tabs = new TabSet({
      partition: `persist:fitts-site-${id}`,
      siteOrigin: origin,
      frame: (jpeg, w, h) => this.broadcast(IPC.siteFrame, id, jpeg, w, h),
      changed: () => this.tabsChanged(id),
      cursor: (type) => this.status(id, { cursor: type }),
      returnToSite: (url) => {
        tabs.select(SITE_TAB);
        void win.wc.loadURL(url).catch(() => undefined);
      },
      closedOldest: () => undefined,
      size: () => {
        const [w = 1024, h = 700] = win.win.getContentSize();
        return [w, h];
      },
    });
    live.tabs = tabs;
    win.onOffsite = (url) => tabs.open(url);
  }

  /** The strip and the address bar follow the tab showing. */
  private tabsChanged(id: string): void {
    const live = this.live.get(id);
    const tabs = live?.tabs;
    const win = live?.window;
    if (!live || !tabs || !win || win.wc.isDestroyed()) return;
    const siteUrl = (live.siteNav?.url ?? live.status.url ?? win.wc.getURL()) || '';
    const list =
      tabs.count > 0 ? tabs.list(win.wc.getTitle() || hostOf(siteUrl), siteUrl) : undefined;
    const wc = tabs.activeWc();
    if (wc) {
      // Leaving the site's tab: remember its address for when it shows again.
      if (!live.siteNav)
        live.siteNav = {
          url: live.status.url,
          canBack: live.status.canBack,
          canForward: live.status.canForward,
          cursor: live.status.cursor,
        };
      this.status(id, {
        ...(list ? { tabs: list } : {}),
        activeTab: tabs.active,
        url: wc.getURL(),
        canBack: wc.navigationHistory.canGoBack(),
        canForward: wc.navigationHistory.canGoForward(),
        cursor: 'default',
      });
      return;
    }
    const back = live.siteNav ?? {};
    live.siteNav = undefined;
    const next: SiteStatus = { ...live.status, ...back, activeTab: SITE_TAB };
    if (list) next.tabs = list;
    else {
      delete next.tabs;
      delete next.activeTab;
    }
    live.status = next;
    this.broadcast(IPC.siteStatus, next);
    if (!live.release) this.onStatus?.(next);
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
    ipcMain.on(IPC.sitePhone, (_e, projectId: unknown, runId: unknown, branch: unknown) => {
      if (typeof projectId !== 'string' || typeof runId !== 'string') return;
      if (typeof branch === 'string') void this.showFixed(projectId, runId, branch);
      else if (branch === null) void this.showLive(projectId);
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
          v.kind === 'branch' &&
          typeof v.branch === 'string';
        if (ok) void this.openVersion(siteId, projectId, runId, v);
      },
    );
    ipcMain.on(IPC.siteResize, (_e, id: unknown, w: unknown, h: unknown) => {
      if (typeof id !== 'string' || typeof w !== 'number' || typeof h !== 'number') return;
      this.window(id)?.resize(w, h);
      const size = this.window(id)?.win.getContentSize();
      if (size) this.live.get(id)?.tabs?.resize(size[0] ?? w, size[1] ?? h);
    });
    ipcMain.on(IPC.siteTab, (_e, id: unknown, action: unknown) => {
      const tabs = typeof id === 'string' ? this.live.get(id)?.tabs : undefined;
      const a = action as { kind?: unknown; id?: unknown } | null;
      if (!tabs || !a || typeof a.id !== 'string') return;
      if (a.kind === 'select') tabs.select(a.id);
      else if (a.kind === 'close') tabs.close(a.id);
    });
    // Only a device Fitts offers, by id: the renderer never sets arbitrary emulation.
    ipcMain.on(IPC.siteDevice, (_e, id: unknown, deviceId: unknown) => {
      if (typeof id !== 'string' || typeof deviceId !== 'string') return;
      const device = this.deviceFor(id, deviceId);
      const win = this.window(id);
      if (!win) return;
      void win.emulate(device).catch(() => undefined);
      if (this.live.has(id)) this.status(id, { device: device?.id ?? SCREEN_DEVICE });
    });
    ipcMain.on(IPC.siteInput, (_e, id: unknown, input: SiteInput) => {
      if (typeof id !== 'string' || !input || typeof input !== 'object') return;
      const tab = this.live.get(id)?.tabs?.activeWc();
      if (tab) tabInput(tab, input);
      else if (this.live.get(id)?.android) void this.live.get(id)?.android?.input(input);
      else this.window(id)?.input(input);
    });
    ipcMain.on(IPC.siteNav, (_e, id: unknown, nav: SiteNav) => {
      if (typeof id !== 'string' || !nav || typeof nav !== 'object') return;
      const tab = this.live.get(id)?.tabs?.activeWc();
      const android = this.live.get(id)?.android;
      // SPEC-phase4 §9.2: on Android, Back is the system Back; the rest has no equivalent.
      if (android)
        return void (nav.kind === 'back' ? android.back().catch(() => undefined) : undefined);
      if (!tab) return this.window(id)?.nav(nav);
      const h = tab.navigationHistory;
      if (nav.kind === 'back' && h.canGoBack()) h.goBack();
      else if (nav.kind === 'forward' && h.canGoForward()) h.goForward();
      else if (nav.kind === 'reload') tab.reload();
    });
    ipcMain.handle(IPC.siteRects, async (_e, id: unknown, refs: unknown) => {
      const win = typeof id === 'string' && this.onSite(id) ? this.window(id) : undefined;
      if (!win || !Array.isArray(refs)) return {};
      return win.rects(refs.filter((r): r is string => typeof r === 'string')).catch(() => ({}));
    });
    ipcMain.handle(IPC.siteElementAt, async (_e, id: unknown, x: unknown, y: unknown) => {
      const win = typeof id === 'string' && this.onSite(id) ? this.window(id) : undefined;
      if (!win || typeof x !== 'number' || typeof y !== 'number') return null;
      return win.elementAt(x, y).catch(() => null);
    });
    ipcMain.handle(IPC.siteRefAt, async (_e, id: unknown, x: unknown, y: unknown) => {
      const win = typeof id === 'string' && this.onSite(id) ? this.window(id) : undefined;
      if (!win || typeof x !== 'number' || typeof y !== 'number') return null;
      return win.refAt(x, y).catch(() => null);
    });
  }
}

/** Accelerator names where the browser's key names differ. */
const TAB_KEYS: Record<string, string> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ' ': 'Space',
};

/** Your input in an off-site tab: plain events, no gate (Fitts never acts there). */
function tabInput(wc: WebContents, input: SiteInput): void {
  if (input.kind === 'focus') wc.focus();
  else if (input.kind === 'mouse') {
    if (input.type === 'mouseDown') wc.focus();
    wc.sendInputEvent({
      type: input.type,
      x: Math.round(input.x),
      y: Math.round(input.y),
      button: input.button ?? 'left',
      clickCount: input.clickCount ?? 1,
    });
  } else if (input.kind === 'wheel')
    wc.sendInputEvent({
      type: 'mouseWheel',
      x: Math.round(input.x),
      y: Math.round(input.y),
      deltaX: -input.deltaX,
      deltaY: -input.deltaY,
      canScroll: true,
    });
  else if (input.kind === 'key') {
    const modifiers = input.modifiers ?? [];
    wc.sendInputEvent({ type: input.type, keyCode: TAB_KEYS[input.key] ?? input.key, modifiers });
    // A printable key types, unless it's a shortcut.
    const shortcut = modifiers.includes('control') || modifiers.includes('meta');
    if (input.type === 'keyDown' && input.key.length === 1 && !shortcut)
      wc.sendInputEvent({ type: 'char', keyCode: input.key });
  }
}
