// The Android target (SPEC-phase4 §9.2): the same operations the agent's Site uses, on a device
// through adb. Snapshots come from uiautomator dumps, input is adb input, frames are screencaps
// polled to the canvas (≈3 fps while acting, 1 fps idle). There is no network to intercept, so
// the gate holds the tap itself: a destructive-named control waits for the owner's answer.
import { nativeImage } from 'electron';
import {
  androidContrast,
  androidDuplicateBounds,
  androidDuplicateLabel,
  androidEditableDesc,
  androidLabel,
  androidTarget,
  flatten,
  type AndroidNode,
  type PageProbeResult,
  type Pixels,
  type SurpriseEvent,
} from '@fitts/probes';
import type { ProbeItem, SiteInput, SiteRect, SiteStatus } from '@fitts/schema';
import type { AxSnapshot, HeldRequest, SiteOp, SiteOpResult } from '../../agent/protocol';
import type { Adb } from './adb';
import { parseDump, roleOf, toSnapshot } from './dump';
import { diffDumps, type Dump } from './surprise';
import { EVENT_SIDE_MS, FrameRing } from '../site/frames';

/** Text a page should never show (§9.3: placeholder-leak on hierarchy text). */
const LEAK = /\b(undefined|null|NaN)\b|\[object Object\]|\{\{\s*\w+\s*\}\}/;

/** The second look after an action (A10). */
const SECOND_LOOK_MS = 1800;

/** How long a screen may take to show its controls after an action or a relaunch. */
const SETTLE_MS = 10_000;
/** How long a dev client reload has to clear the screen it started from. */
const RELOAD_MS = 8000;

const KEYS: Record<string, string> = {
  Enter: 'KEYCODE_ENTER',
  Tab: 'KEYCODE_TAB',
  Escape: 'KEYCODE_ESCAPE',
  Backspace: 'KEYCODE_DEL',
};

export interface AndroidScreen {
  /** The App Model's screens, to name the screen from its header (route + title). */
  screens?: { route: string; title?: string }[];
  /** The app's URL scheme, for deep links to a route ("basilember"). */
  scheme?: string;
  /** The Android package ("com.basilandember.order"), the host of the screen URLs. */
  appId?: string;
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

export class AndroidWindow {
  private last: { root: AndroidNode; at: number } | undefined;
  /** Per screen: the controls below the fold, with the swipes each took (see belowFold). */
  private readonly below = new Map<string, Map<string, { node: AndroidNode; swipes: number }>>();
  private density = 420;
  private size = { width: 1080, height: 2400 };
  private pending = new Map<string, (allow: boolean) => void>();
  private heldN = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private busyUntil = 0;
  private stopped = false;
  /** A10: Fitts's clock for surprises, input times on it, each screen's last dump, the events. */
  private readonly started = Date.now();
  private readonly inputs: number[] = [];
  private readonly lastDump = new Map<string, Dump>();
  private events: SurpriseEvent[] = [];
  /** The last 4 s of screencaps (about 3 a second), for the judge's frames. */
  private readonly ring = new FrameRing(200);

  constructor(
    private readonly adb: Adb,
    private readonly onFrame: (jpeg: Buffer, w: number, h: number) => void,
    private readonly onStatus: (patch: Partial<SiteStatus>) => void,
    private readonly onHeld: (held: HeldRequest) => void = () => undefined,
    private readonly screen: AndroidScreen = {},
  ) {}

  async start(): Promise<void> {
    this.density = await this.adb.density();
    this.size = await this.adb.size();
    this.frames();
  }

  /**
   * After the dev client is pointed at Metro: the app reloads, and the screen before the reload
   * (or the splash) can pass for the app. Waits until one of the App Model's screens is showing,
   * or, with none known, gives the reload a moment and then waits for controls (Nov 2: a bench
   * crawl that started mid-reload saw one nameless screen and took no actions).
   */
  async ready(timeoutMs = 90_000): Promise<boolean> {
    const titles = (this.screen.screens ?? []).flatMap((s) => (s.title ? [s.title] : []));
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    if (!titles.length) {
      await pause(3000);
      return flatten(await this.settled()).some((n) => n.clickable);
    }
    const known = async () => {
      const texts = flatten(await this.tree()).map((n) => n.text.trim().toLowerCase());
      return titles.some((t) => texts.includes(t.toLowerCase()));
    };
    // The reload clears the screen it started from; a screen that never clears had no reload.
    for (const end = Date.now() + RELOAD_MS; Date.now() < end && (await known());) await pause(500);
    for (const end = Date.now() + timeoutMs; Date.now() < end && !this.stopped;) {
      if (await known()) return true;
      await pause(1000);
    }
    return false;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.second) clearTimeout(this.second);
    for (const answer of this.pending.values()) answer(false);
    this.pending.clear();
  }

  /** Screencaps to the canvas: faster for a few seconds after an action. */
  private frames(): void {
    if (this.stopped) return;
    // As many as the emulator gives, about 3 a second: the canvas and the judge's ring.
    const next = () => {
      this.timer = setTimeout(() => this.frames(), Date.now() < this.busyUntil ? 150 : 300);
    };
    void this.adb
      .screencap()
      .then((png) => {
        const img = nativeImage.createFromBuffer(png);
        const { width, height } = img.getSize();
        if (!width || !height) return;
        const jpeg = img.toJPEG(80);
        this.ring.push({ at: Date.now(), jpeg, width, height });
        this.onFrame(jpeg, width, height);
      })
      .catch(() => undefined)
      .finally(next);
  }

  private acting(): void {
    this.busyUntil = Date.now() + 3000;
    this.inputs.push(Date.now() - this.started);
    if (this.inputs.length > 200) this.inputs.shift();
  }

  private async tree(fresh = true): Promise<AndroidNode> {
    if (!fresh && this.last && Date.now() - this.last.at < 1500) return this.last.root;
    const root = parseDump(await this.adb.dump());
    this.last = { root, at: Date.now() };
    this.noticeChanges(root);
    return root;
  }

  /**
   * The screen once it has controls: an app that's relaunching or loading a screen dumps an empty
   * hierarchy for a moment, and a crawl that sees nothing would end (Nov 2, the first bench).
   */
  private async settled(timeoutMs = SETTLE_MS): Promise<AndroidNode> {
    const end = Date.now() + timeoutMs;
    let root = await this.tree();
    while (!flatten(root).some((n) => n.clickable) && Date.now() < end) {
      await new Promise((r) => setTimeout(r, 500));
      root = await this.tree();
    }
    return root;
  }

  /** A10: what moved or appeared since this screen's last dump, with nothing to prompt it. */
  private noticeChanges(root: AndroidNode): void {
    if (!flatten(root).some((n) => n.clickable)) return;
    const path = this.screenOf(root).path;
    const dump: Dump = { root, at: Date.now() - this.started };
    const prev = this.lastDump.get(path);
    if (prev)
      this.events.push(
        ...diffDumps(prev, dump, this.inputs, { density: this.density, screen: this.size, path }),
      );
    this.lastDump.set(path, dump);
    if (this.events.length > 100) this.events = this.events.slice(-100);
  }

  /**
   * The judge's frames around a moment (wall-clock ms): up to 8 from the ring, 2 s each side. When
   * the ring is thin, the last frame before it and fresh shots after.
   */
  async framesAround(
    at: number,
  ): Promise<{ at: number; jpegBase64: string; width: number; height: number }[]> {
    const wait = Math.min(EVENT_SIDE_MS + 250, at + EVENT_SIDE_MS + 150 - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    let frames = this.ring.around(at);
    if (frames.length < 3) {
      const before = frames.filter((x) => x.at <= at).slice(-1);
      const after: typeof frames = [];
      for (const gap of [0, 1000, 1500]) {
        if (gap) await new Promise((r) => setTimeout(r, gap));
        const img = nativeImage.createFromBuffer(
          await this.adb.screencap().catch(() => Buffer.alloc(0)),
        );
        const { width, height } = img.getSize();
        if (width && height) after.push({ at: Date.now(), jpeg: img.toJPEG(80), width, height });
      }
      frames = [...before, ...after];
    }
    return frames.map((x) => ({
      at: x.at,
      jpegBase64: x.jpeg.toString('base64'),
      width: x.width,
      height: x.height,
    }));
  }

  /** The screen's name: the header text matched to the App Model's screens, else its slug. */
  screenOf(root: AndroidNode): { path: string; title: string } {
    const texts = flatten(root)
      // Any text, not only TextViews: a header role arrives as a plain View (the wordmark).
      // Words, not a badge's count ("1" on the cart button isn't a screen's name).
      .filter((n) => !n.clickable && /[A-Za-z].*[A-Za-z]/.test(n.text) && n.bounds.y < 320)
      .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)
      .map((n) => n.text.trim());
    const title = texts[0] ?? '';
    const known =
      this.screen.screens?.find(
        (s) => s.title && texts.some((t) => t.toLowerCase() === s.title?.toLowerCase()),
      ) ?? this.byTestIds(root);
    return { path: known?.route ?? `/${slugify(title) || 'screen'}`, title };
  }

  /**
   * A screen whose header shows its content (an item's name) rather than its title: the App
   * Model's route whose first segment begins two or more of the screen's testIDs ("/item/:id"
   * for item-add and item-size-small). Nov 2: every such screen was "/screen".
   */
  private byTestIds(root: AndroidNode): { route: string } | undefined {
    const ids = flatten(root).map((n) => n.ref);
    let best: { route: string; n: number } | undefined;
    for (const s of this.screen.screens ?? []) {
      const seg = s.route.split('/').find((p) => p && !p.startsWith(':') && !p.startsWith('['));
      if (!seg) continue;
      const n = ids.filter((id) => id.startsWith(`${seg}-`)).length;
      if (n >= 2 && n > (best?.n ?? 0)) best = { route: s.route, n };
    }
    return best;
  }

  async snapshot(): Promise<AxSnapshot> {
    const root = await this.settled();
    const screen = this.screenOf(root);
    const appId = this.screen.appId ?? 'app';
    this.onStatus({ url: `android://${appId}${screen.path}` });
    const below = await this.belowFold(root, screen.path);
    return toSnapshot(
      below.length ? { ...root, children: [...root.children, ...below] } : root,
      screen,
      appId,
    );
  }

  /**
   * The controls below the fold of a scrolling screen (checkout's "Place order", the order's
   * "Cancel order"): a dump shows only what's on screen, so a journey never saw them (Nov 2).
   * The screen is swiped down up to twice, controls with a testID that weren't showing are
   * kept (with the swipes it took), and it's swiped back up. Once per screen.
   */
  private async belowFold(root: AndroidNode, path: string): Promise<AndroidNode[]> {
    const cached = this.below.get(path);
    const showing = new Set(flatten(root).map((n) => n.ref));
    if (cached) return [...cached.values()].map((b) => b.node).filter((n) => !showing.has(n.ref));
    const found = new Map<string, { node: AndroidNode; swipes: number }>();
    this.below.set(path, found);
    const list = flatten(root)
      .filter((n) => n.scrollable && n.bounds.h > 400)
      .sort((a, b) => b.bounds.h - a.bounds.h)[0];
    if (!list) return [];
    const x = Math.round(list.bounds.x + list.bounds.w / 2);
    const from = Math.round(list.bounds.y + list.bounds.h * 0.8);
    const to = Math.round(list.bounds.y + list.bounds.h * 0.25);
    // The swipes are Fitts's own input: whatever moves is not a surprise.
    this.acting();
    let swipes = 0;
    for (; swipes < 2;) {
      await this.adb.swipe(x, from, x, to, 350);
      swipes += 1;
      await new Promise((r) => setTimeout(r, 600));
      const after = parseDump(await this.adb.dump());
      let fresh = 0;
      for (const n of flatten(after))
        if (
          !/^a\d+$/.test(n.ref) &&
          !showing.has(n.ref) &&
          !found.has(n.ref) &&
          (n.clickable || roleOf(n) === 'textbox')
        ) {
          found.set(n.ref, { node: n, swipes });
          fresh += 1;
        }
      if (fresh === 0) break;
    }
    for (let i = 0; i <= swipes; i++) await this.adb.swipe(x, to, x, from, 250);
    await new Promise((r) => setTimeout(r, 500));
    return [...found.values()].map((b) => b.node);
  }

  /** A control below the fold, scrolled into view: the node as it is now, or undefined. */
  private async reveal(ref: string): Promise<AndroidNode | undefined> {
    const path = this.last ? this.screenOf(this.last.root).path : '';
    const b = this.below.get(path)?.get(ref);
    const list = this.last
      ? flatten(this.last.root)
          .filter((n) => n.scrollable && n.bounds.h > 400)
          .sort((a, c) => c.bounds.h - a.bounds.h)[0]
      : undefined;
    if (!b || !list) return undefined;
    const x = Math.round(list.bounds.x + list.bounds.w / 2);
    for (let i = 0; i < b.swipes; i++)
      await this.adb.swipe(
        x,
        Math.round(list.bounds.y + list.bounds.h * 0.8),
        x,
        Math.round(list.bounds.y + list.bounds.h * 0.25),
        350,
      );
    await new Promise((r) => setTimeout(r, 600));
    return flatten(await this.tree()).find((n) => n.ref === ref);
  }

  private find(ref: string): AndroidNode | undefined {
    return this.last ? flatten(this.last.root).find((n) => n.ref === ref) : undefined;
  }

  private center(n: AndroidNode) {
    return { x: n.bounds.x + n.bounds.w / 2, y: n.bounds.y + n.bounds.h / 2 };
  }

  /** The gate on Android (§9.2): no request to hold, so the tap waits for the owner's answer. */
  private ask(name: string): Promise<boolean> {
    const id = `tap-${++this.heldN}`;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.onHeld({ id, method: 'TAP', url: `android-tap:${name}` });
    });
  }

  release(id: string, allow: boolean): void {
    this.pending.get(id)?.(allow);
    this.pending.delete(id);
  }

  private async afterAction(before: string): Promise<{ path: string; navigated: boolean }> {
    await new Promise((r) => setTimeout(r, 500));
    const root = await this.settled();
    const path = this.screenOf(root).path;
    this.lookAgain();
    return { path, navigated: path !== before };
  }

  private second: ReturnType<typeof setTimeout> | undefined;

  /**
   * A10: a second look at the screen a beat after an action settles, so content that arrives
   * late (a banner a second after the screen opens) is caught near when it moved, while the
   * frame ring still holds the moment. Skipped when another action comes first.
   */
  private lookAgain(): void {
    if (this.second) clearTimeout(this.second);
    const inputs = this.inputs.length;
    this.second = setTimeout(() => {
      this.second = undefined;
      if (this.stopped || this.inputs.length !== inputs) return;
      void this.tree().catch(() => undefined);
    }, SECOND_LOOK_MS);
  }

  async click(ref: string, destructive: boolean) {
    const before = this.last ? this.screenOf(this.last.root).path : '';
    const n =
      this.find(ref) ??
      flatten(await this.tree()).find((x) => x.ref === ref) ??
      (await this.reveal(ref));
    if (!n) throw new Error(`No element ${ref} on ${before}`);
    if (destructive && !(await this.ask(n.text || n.desc || ref)))
      return { path: before, navigated: false };
    this.acting();
    const c = this.center(n);
    await this.adb.tap(c.x, c.y);
    return this.afterAction(before);
  }

  async type(ref: string, text: string) {
    const before = this.last ? this.screenOf(this.last.root).path : '';
    const n =
      this.find(ref) ??
      flatten(await this.tree()).find((x) => x.ref === ref) ??
      (await this.reveal(ref));
    if (!n) throw new Error(`No field ${ref}`);
    this.acting();
    const c = this.center(n);
    await this.adb.tap(c.x, c.y);
    await this.adb.text(text);
    // The keyboard covers the bottom of the screen (checkout's "Place order"): put it away.
    if (await this.adb.keyboardShown().catch(() => false)) await this.adb.key('KEYCODE_BACK');
    return this.afterAction(before);
  }

  async back() {
    const before = this.last ? this.screenOf(this.last.root).path : '';
    this.acting();
    await this.adb.key('KEYCODE_BACK');
    return this.afterAction(before);
  }

  async press(key: string) {
    const before = this.last ? this.screenOf(this.last.root).path : '';
    this.acting();
    await this.adb.key(KEYS[key] ?? `KEYCODE_${key.toUpperCase()}`);
    return this.afterAction(before);
  }

  /** A route by deep link (the app's scheme), when it has one; else stays put. */
  async goto(path: string) {
    const before = this.last ? this.screenOf(this.last.root).path : '';
    // Already there (the app opens on its first screen): a deep link would only relaunch it.
    if (before === path) return { path, navigated: false };
    // Only the app's own routes have deep links; a screen named from its text is reached by tapping.
    const known = this.screen.screens?.some((x) => x.route === path && !x.route.includes(':'));
    if (!known) return { path: before, navigated: false };
    if (this.screen.scheme) {
      this.acting();
      await this.adb.open(`${this.screen.scheme}://${path.replace(/^\//, '')}`);
    }
    return this.afterAction(before);
  }

  /** The PNG as RGBA pixels, for the contrast estimate. */
  private async pixels(): Promise<Pixels | null> {
    const img = nativeImage.createFromBuffer(await this.adb.screencap());
    const { width, height } = img.getSize();
    if (!width || !height) return null;
    // Electron's bitmap is BGRA: swap to RGBA.
    const bgra = img.toBitmap();
    const data = new Uint8Array(bgra.length);
    for (let i = 0; i < bgra.length; i += 4) {
      data[i] = bgra[i + 2] ?? 0;
      data[i + 1] = bgra[i + 1] ?? 0;
      data[i + 2] = bgra[i] ?? 0;
      data[i + 3] = bgra[i + 3] ?? 255;
    }
    return { width, height, data };
  }

  /** The Android probes (§9.3), named like the web's so the run treats them the same. */
  async probes(): Promise<PageProbeResult[]> {
    const all = flatten(await this.tree());
    const px = await this.pixels().catch(() => null);
    const result = (probe: PageProbeResult['probe'], items: ProbeItem[]): PageProbeResult => ({
      probe,
      pass: items.length === 0,
      items,
    });
    const leaks = all
      .filter((n) => n.text && LEAK.test(n.text))
      .map((n) => ({
        ref: n.ref,
        selector: n.cls.split('.').pop() ?? '',
        measured: `shows "${n.text.slice(0, 60)}"`,
        expected: 'real content, never a placeholder or a missing value',
      }));
    return [
      result('android-target', androidTarget(all, this.density)),
      result('android-label', androidLabel(all)),
      result('android-duplicate-label', androidDuplicateLabel(all)),
      result('android-duplicate-bounds', androidDuplicateBounds(all)),
      result('android-editable-desc', androidEditableDesc(all)),
      result('android-contrast', px ? androidContrast(all, px, this.density).items : []),
      result('placeholder-leak', leaks),
    ];
  }

  rects(refs: string[]): Record<string, SiteRect> {
    const out: Record<string, SiteRect> = {};
    for (const ref of refs) {
      const n = this.find(ref);
      if (n)
        out[ref] = { left: n.bounds.x, top: n.bounds.y, width: n.bounds.w, height: n.bounds.h };
    }
    return out;
  }

  /** The node under a point of the screen (device px), for the owner's canvas clicks. */
  refAt(x: number, y: number): string | undefined {
    if (!this.last) return undefined;
    const hits = flatten(this.last.root).filter(
      (n) =>
        n.clickable &&
        x >= n.bounds.x &&
        x <= n.bounds.x + n.bounds.w &&
        y >= n.bounds.y &&
        y <= n.bounds.y + n.bounds.h,
    );
    return hits.sort((a, b) => a.bounds.w * a.bounds.h - b.bounds.w * b.bounds.h)[0]?.ref;
  }

  async screenshot(): Promise<{ jpegBase64: string; width: number; height: number }> {
    const img = nativeImage.createFromBuffer(await this.adb.screencap());
    const { width, height } = img.getSize();
    return { jpegBase64: img.toJPEG(80).toString('base64'), width, height };
  }

  private down: { x: number; y: number } | undefined;

  /** The owner driving from the canvas (§9.2): a click is a tap, a wheel a swipe, keys typed. */
  async input(input: SiteInput): Promise<void> {
    this.acting();
    if (input.kind === 'mouse') {
      if (input.type === 'mouseDown') this.down = { x: input.x, y: input.y };
      else if (input.type === 'mouseUp' && this.down) {
        const d = this.down;
        this.down = undefined;
        if (Math.hypot(input.x - d.x, input.y - d.y) > 24)
          await this.adb.swipe(d.x, d.y, input.x, input.y);
        else await this.adb.tap(input.x, input.y);
      }
    } else if (input.kind === 'wheel') {
      const { x, y } = input;
      await this.adb.swipe(x, y, x - input.deltaX, y - input.deltaY, 200);
    } else if (input.kind === 'key' && input.type === 'keyDown') {
      if (input.key.length === 1) await this.adb.text(input.key);
      else if (KEYS[input.key]) await this.adb.key(KEYS[input.key] ?? '');
    }
  }

  /** The site operations, as the manager routes them for an Android project. */
  async run(request: SiteOp): Promise<SiteOpResult> {
    switch (request.op) {
      case 'snapshot':
        return { op: 'snapshot', snapshot: await this.snapshot() };
      case 'screenshot':
        return { op: 'screenshot', ...(await this.screenshot()) };
      case 'navigate':
        return { op: 'action', ...(await this.goto(request.path)) };
      case 'click':
        return { op: 'action', ...(await this.click(request.ref, request.destructive ?? false)) };
      case 'type':
        return { op: 'action', ...(await this.type(request.ref, request.text)) };
      case 'press':
        return { op: 'action', ...(await this.press(request.key)) };
      case 'back':
        return { op: 'action', ...(await this.back()) };
      case 'probes':
        return { op: 'probes', results: await this.probes() };
      case 'rects':
        return { op: 'rects', rects: this.rects(request.refs) };
      case 'value': {
        const n = this.find(request.ref);
        return { op: 'value', value: n ? n.text : null };
      }
      case 'release':
        this.release(request.id, request.allow);
        return { op: 'released' };
      case 'reveal':
        return { op: 'revealed' };
      // What a phone has no equivalent for: nothing found, nothing to hold or replay.
      case 'focus':
      case 'viewport':
      case 'cellProbes':
        return request.op === 'cellProbes'
          ? { op: 'probes', results: [] }
          : { op: 'items', items: [] };
      case 'links':
        return { op: 'links', statuses: {} };
      case 'network':
        return { op: 'network', requests: [] };
      case 'breakpoints':
        return { op: 'breakpoints', media: [] };
      case 'device':
        return { op: 'device', previous: null };
      case 'cell':
      case 'cells':
        return { op: 'ok' };
      case 'surprise': {
        const events = this.events;
        this.events = [];
        return { op: 'surprise', events, inputs: [...this.inputs], clock: this.started };
      }
      case 'frames':
        return { op: 'frames', frames: await this.framesAround(request.at) };
      case 'source':
        return { op: 'source', frames: [] };
      case 'sources':
        return { op: 'sources', chains: {} };
      case 'perf':
        return { op: 'perf', pages: [] };
      case 'keyboard':
        return {
          op: 'keyboard',
          stops: [],
          facts: { interactive: [], navLinks: 0, skipLink: false },
        };
      case 'dialog':
        return { op: 'dialog', check: null };
      default:
        throw new Error(`${request.op} isn't available on Android`);
    }
  }
}
