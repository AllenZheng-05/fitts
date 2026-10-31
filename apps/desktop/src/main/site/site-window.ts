// The user's site in a hidden offscreen window (SPEC-phase2 §5.1), streamed to the renderer as
// JPEG frames. No preload; sandboxed; a session per project; every permission denied. Fitts's
// own queries (element boxes, refs) run in an isolated world, never the page's.
import type { Feedback, PageProbeName, PageProbeResult, RequestRecord } from '@fitts/probes';
import PROBES from '@fitts/probes/page.js?raw';
import {
  DEVICES,
  type ProbeItem,
  type SiteDevice,
  type SiteInput,
  type SiteNav,
  type SiteRect,
  type SiteStatus,
} from '@fitts/schema';

/** A current mobile Chrome, so sites serve their phone experience. */
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
import type { AxSnapshot, HeldRequest, OpTrace } from '../../agent/protocol';
import { BrowserWindow, session, type WebContents } from 'electron';

/** What "Point at something" picks when the pointer is inside one: a control, as a whole. */
const CONTROLS =
  'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="switch"],[role="menuitem"],[role="option"]';

/** Isolated world for Fitts's scripts (refs, rects); the page can't see them. */
const WORLD = 1001;

/** Assigns `e<n>` to elements without a data-ref/data-testid, stable for the page load. */
const REFS = `(() => {
  const w = window;
  w.__fitts = w.__fitts || { n: 0 };
  const own = (el) => el.getAttribute('data-ref') || el.getAttribute('data-testid') || el.getAttribute('data-fitts-ref');
  const refOf = (el) => {
    const r = own(el);
    if (r) return r;
    const id = 'e' + (++w.__fitts.n);
    el.setAttribute('data-fitts-ref', id);
    return id;
  };
  const find = (ref) => {
    const q = CSS.escape(ref);
    return document.querySelector('[data-ref="' + q + '"],[data-testid="' + q + '"],[data-fitts-ref="' + q + '"]');
  };
  return { own, refOf, find };
})()`;

export class SiteWindow {
  readonly win: BrowserWindow;
  private origin: string;

  constructor(
    readonly projectId: string,
    private readonly baseUrl: string,
    private readonly onFrame: (jpeg: Buffer, width: number, height: number) => void,
    private readonly onStatus: (status: Partial<SiteStatus>) => void,
    /** A write from Fitts's action, held for the gate (§13). */
    private readonly onHeld: (held: HeldRequest) => void = () => undefined,
  ) {
    this.origin = new URL(baseUrl).origin;
    const ses = session.fromPartition(`persist:fitts-site-${projectId}`);
    ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    this.win = new BrowserWindow({
      width: 1024,
      height: 700,
      show: false,
      useContentSize: true,
      webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, session: ses },
    });
    const wc = this.win.webContents;
    wc.setFrameRate(30);
    wc.on('paint', (_e, _dirty, image) => {
      const { width, height } = image.getSize();
      if (width && height) this.onFrame(image.toJPEG(80), width, height);
    });
    wc.on('cursor-changed', (_e, type) => this.onStatus({ cursor: type }));
    // Only the project's origin; everything else is checked later (links probe), never opened.
    // Either way the page did respond to the action that caused it (the feedback probe).
    wc.on('will-navigate', (e, url) => {
      if (this.allowed(url)) return;
      e.preventDefault();
      this.openedAt = Date.now();
    });
    wc.setWindowOpenHandler(({ url }) => {
      if (this.allowed(url)) void wc.loadURL(url);
      else this.openedAt = Date.now();
      return { action: 'deny' };
    });
    const pushHistory = () =>
      this.onStatus({
        url: wc.getURL(),
        canBack: wc.navigationHistory.canGoBack(),
        canForward: wc.navigationHistory.canGoForward(),
      });
    wc.on('did-navigate', pushHistory);
    wc.on('did-navigate-in-page', pushHistory);
    this.recordNetwork();
  }

  // ── Network (the network and feedback-timing probes, §7) ──────────────────────

  private requests = new Map<string, RequestRecord>();
  private drained: RequestRecord[] = [];
  /** Each record's CDP network id (held requests are matched by it). */
  private readonly networkIds = new WeakMap<RequestRecord, string>();
  /** The control being used right now, so requests can be traced back to it. */
  private acting: string | undefined;
  /** When the page last tried to open a new tab or leave the site (both blocked). */
  private openedAt = 0;
  /** The device it's emulating (null: a desktop browser the panel's size). */
  private deviceId: string | null = null;

  get device(): SiteDevice | null {
    return DEVICES.find((d) => d.id === this.deviceId) ?? null;
  }
  /** Endpoints whose big JSON body was already counted. */
  private readonly parsed = new Set<string>();

  private recordNetwork(): void {
    const dbg = this.wc.debugger;
    try {
      dbg.attach('1.3');
    } catch {
      return; // Already attached (devtools open): no network probe for this window.
    }
    void dbg.sendCommand('Network.enable').catch(() => undefined);
    // The gate's network enforcement (§13): API calls pause here; writes from Fitts's own
    // actions that look destructive wait for the user's answer.
    void dbg
      .sendCommand('Fetch.enable', {
        patterns: [
          { urlPattern: '*', resourceType: 'XHR', requestStage: 'Request' },
          { urlPattern: '*', resourceType: 'Fetch', requestStage: 'Request' },
        ],
      })
      .catch(() => undefined);
    dbg.on('message', (_e, method: string, params: Record<string, unknown>) => {
      if (method === 'Fetch.requestPaused') {
        this.paused(params);
        return;
      }
      const id = typeof params['requestId'] === 'string' ? params['requestId'] : '';
      if (method === 'Network.requestWillBeSent') {
        const req = params['request'] as { url: string; method: string };
        const type = typeof params['type'] === 'string' ? params['type'] : 'Other';
        // API calls and pages only: the dev server's module requests would crowd them out.
        if (!this.allowed(req.url) || !['Fetch', 'XHR', 'Document'].includes(type)) return;
        const record: RequestRecord = {
          url: req.url,
          method: req.method,
          route: this.path().split('?')[0] ?? '/',
          type,
          status: 0,
          startMs: Date.now(),
          endMs: null,
          bytes: 0,
          ...(this.acting ? { ref: this.acting } : {}),
        };
        this.requests.set(id, record);
        this.networkIds.set(record, id);
        this.drained.push(record);
        if (this.drained.length > 2000) this.drained.shift();
      } else if (method === 'Network.responseReceived') {
        const r = this.requests.get(id);
        if (!r) return;
        const res = params['response'] as { status: number; headers: Record<string, string> };
        r.status = res.status;
        const h = Object.fromEntries(
          Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), v]),
        );
        if (h['cache-control']) r.cacheControl = h['cache-control'];
        if (h['etag']) r.etag = h['etag'];
      } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
        const r = this.requests.get(id);
        if (!r) return;
        r.endMs = Date.now();
        r.bytes = Number(params['encodedDataLength'] ?? 0);
        this.requests.delete(id);
        // Big JSON: count its longest array (the payload probe, #12 on demo/chat).
        const api = r.type === 'Fetch' || r.type === 'XHR';
        const endpoint = r.url.split('?')[0] ?? r.url;
        if (method === 'Network.loadingFinished' && api && r.bytes > 100_000) {
          if (this.parsed.has(endpoint)) return;
          this.parsed.add(endpoint);
          void dbg
            .sendCommand('Network.getResponseBody', { requestId: id })
            .then((b: { body: string; base64Encoded: boolean }) => {
              if (!b.base64Encoded) r.arrayItems = longestArray(b.body);
            })
            .catch(() => undefined);
        }
      }
    });
  }

  /** Fitts is acting (a traced click or typing): only its writes can be held. */
  private gating = false;
  /** The current click's control is named like a destructive one (delete, pay, …). */
  private destructiveAct = false;
  /** Held requests: Fetch id → network id. */
  private readonly held = new Map<string, string>();

  private paused(params: Record<string, unknown>): void {
    const id = typeof params['requestId'] === 'string' ? params['requestId'] : '';
    const networkId = typeof params['networkId'] === 'string' ? params['networkId'] : '';
    const req = params['request'] as { url: string; method: string };
    if (!this.gating || !destructiveRequest(req.method, req.url, this.destructiveAct)) {
      void this.wc.debugger
        .sendCommand('Fetch.continueRequest', { requestId: id })
        .catch(() => undefined);
      return;
    }
    this.held.set(id, networkId);
    this.onHeld({ id, method: req.method, url: req.url });
  }

  /** The gate's answer: send the held request, or fail it as if the network refused. */
  async release(id: string, allow: boolean): Promise<void> {
    if (!this.held.has(id)) return;
    this.held.delete(id);
    await this.wc.debugger
      .sendCommand(
        allow ? 'Fetch.continueRequest' : 'Fetch.failRequest',
        allow ? { requestId: id } : { requestId: id, errorReason: 'BlockedByClient' },
      )
      .catch(() => undefined);
  }

  /** Requests since the last drain (the agent analyzes them per route). */
  drainNetwork(): RequestRecord[] {
    const out = this.drained.filter((r) => r.endMs !== null);
    this.drained = this.drained.filter((r) => r.endMs === null);
    return out;
  }

  // ── Probes (§7): the bundled IIFE, in the isolated world ─────────────────────

  private async probes<T>(body: string): Promise<T> {
    const has = await this.evaluate<boolean>('return !!window.__fittsProbes;');
    if (!has) await this.wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: PROBES }]);
    return this.evaluate<T>(`const P = window.__fittsProbes; ${body}`);
  }

  runProbes(names: PageProbeName[]): Promise<PageProbeResult[]> {
    return this.probes<PageProbeResult[]>(`return P.run(${JSON.stringify(names)}, F);`);
  }

  /** Tabs through the page with real key presses; flags focus with no visible change. */
  async focusSweep(): Promise<ProbeItem[]> {
    this.focus();
    const count = await this.probes<number>('return P.focusStart();');
    const items: ProbeItem[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < Math.min(count, 25); i++) {
      this.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
      this.wc.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
      await new Promise((r) => setTimeout(r, 40));
      const res = await this.probes<ProbeItem | null | 'none'>('return P.focusCheck(F);');
      if (res === 'none') break;
      if (res) {
        if (seen.has(res.ref)) break;
        seen.add(res.ref);
        items.push(res);
      }
    }
    await this.evaluate('document.activeElement && document.activeElement.blur(); return true;');
    return items;
  }

  /** 360, 768 and 1280px wide: sideways scrolling and cut-off text. */
  async viewportSweep(): Promise<ProbeItem[]> {
    const [w0 = 1024, h0 = 700] = this.win.getContentSize();
    const items: ProbeItem[] = [];
    try {
      for (const width of [360, 768, 1280]) {
        this.win.setContentSize(width, h0);
        await new Promise((r) => setTimeout(r, 300));
        items.push(...(await this.probes<ProbeItem[]>(`return P.overflow(F, ${width});`)));
      }
    } finally {
      this.win.setContentSize(w0, h0);
      await new Promise((r) => setTimeout(r, 150));
    }
    return items;
  }

  value(ref: string): Promise<string | null> {
    return this.probes<string | null>(`return P.valueOf(${JSON.stringify(ref)}, F);`);
  }

  /** HEAD (then GET) each same-origin link from the page itself; returns the status codes. */
  links(hrefs: string[]): Promise<Record<string, number>> {
    const same = hrefs
      .filter((h) => this.allowed(new URL(h, this.baseUrl).toString()))
      .slice(0, 100);
    return this.evaluate<Record<string, number>>(`
      const out = {};
      return Promise.all(${JSON.stringify(same)}.map(async (h) => {
        try {
          let r = await fetch(h, { method: 'HEAD', redirect: 'follow', cache: 'no-store' });
          if (r.status === 405) r = await fetch(h, { cache: 'no-store' });
          out[h] = r.status;
        } catch { out[h] = 0; }
      })).then(() => out);`);
  }

  private allowed(url: string): boolean {
    try {
      return new URL(url).origin === this.origin;
    } catch {
      return false;
    }
  }

  get wc(): WebContents {
    return this.win.webContents;
  }

  load(path: string): Promise<void> {
    return this.wc.loadURL(new URL(path, this.baseUrl).toString());
  }

  /**
   * A device to look like (null: a desktop browser the panel's size). Phones and tablets get
   * mobile emulation, so `<meta name="viewport">`, touch and a mobile user agent all apply, the
   * way the site renders on the real thing; frames stay at CSS px (scale 1).
   */
  async emulate(device: SiteDevice | null): Promise<void> {
    const dbg = this.wc.debugger;
    // The same device again (a layout change remounts the canvas) changes nothing.
    if (!dbg.isAttached() || (device?.id ?? null) === this.deviceId) return;
    this.deviceId = device?.id ?? null;
    if (device?.mobile) {
      await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: device.width,
        height: device.height,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await dbg.sendCommand('Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: 5,
      });
      await dbg.sendCommand('Emulation.setUserAgentOverride', { userAgent: MOBILE_UA });
    } else {
      await dbg.sendCommand('Emulation.clearDeviceMetricsOverride').catch(() => undefined);
      await dbg.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false });
      await dbg.sendCommand('Emulation.setUserAgentOverride', {
        userAgent: this.wc.getUserAgent(),
      });
    }
    if (device) this.resize(device.width, device.height);
    // A page reads its device once, at load (media queries, user agent): load it again.
    if (this.wc.getURL()) this.wc.reload();
  }

  /** The window matches the site panel, in CSS px at device scale 1. */
  resize(width: number, height: number): void {
    const w = Math.max(200, Math.round(width));
    const h = Math.max(150, Math.round(height));
    this.win.setContentSize(w, h);
  }

  setActive(active: boolean): void {
    this.wc.setFrameRate(active ? 30 : 10);
  }

  nav(nav: SiteNav): void {
    const h = this.wc.navigationHistory;
    if (nav.kind === 'path') {
      const url = new URL(nav.path, this.baseUrl);
      if (url.origin === this.origin && url.toString() !== this.wc.getURL())
        void this.load(nav.path);
    } else if (nav.kind === 'back' && h.canGoBack()) h.goBack();
    else if (nav.kind === 'forward' && h.canGoForward()) h.goForward();
    else if (nav.kind === 'reload') this.wc.reload();
  }

  /**
   * Gives the hidden page keyboard focus, as a focused browser tab has: without it Tab moves
   * nothing, focus rings and focus-opened menus don't show, and a native <select> never paints
   * its list. The window itself stays hidden (offscreen windows have no native view to focus).
   */
  focus(): void {
    const wc = this.wc;
    if (wc.isDestroyed()) return;
    const hidden = !this.win.isVisible();
    wc.focus();
    // macOS focuses the owning window along with its contents: keep it out of sight.
    if (hidden && this.win.isVisible()) this.win.hide();
  }

  input(input: SiteInput): void {
    const wc = this.wc;
    if (input.kind === 'focus') {
      this.focus();
    } else if (input.kind === 'key') {
      void this.key(input);
    } else if (input.kind === 'mouse') {
      if (input.type === 'mouseDown') this.focus();
      wc.sendInputEvent({
        type: input.type,
        x: Math.round(input.x),
        y: Math.round(input.y),
        button: input.button ?? 'left',
        clickCount: input.clickCount ?? 1,
      });
    } else if (input.kind === 'wheel') {
      wc.sendInputEvent({
        type: 'mouseWheel',
        x: Math.round(input.x),
        y: Math.round(input.y),
        deltaX: -input.deltaX,
        deltaY: -input.deltaY,
        canScroll: true,
      });
    }
  }

  /**
   * A key through the DevTools protocol, with the browser's own key, code and keyCode: the
   * page sees exactly what a real browser would send (sendInputEvent loses `code`, which many
   * sites' shortcuts read). A printable key carries its text, so it also types.
   */
  private async key(input: Extract<SiteInput, { kind: 'key' }>): Promise<void> {
    const dbg = this.wc.debugger;
    if (!dbg.isAttached()) return;
    const mods = input.modifiers ?? [];
    const modifiers =
      (mods.includes('alt') ? 1 : 0) |
      (mods.includes('control') ? 2 : 0) |
      (mods.includes('meta') ? 4 : 0) |
      (mods.includes('shift') ? 8 : 0);
    const command = mods.includes('control') || mods.includes('meta');
    const text =
      input.key === 'Enter' ? '\r' : input.key.length === 1 && !command ? input.key : undefined;
    const editing = process.platform === 'darwin' && mods.includes('meta') ? macCommand(input) : [];
    await dbg
      .sendCommand('Input.dispatchKeyEvent', {
        type: input.type === 'keyUp' ? 'keyUp' : text ? 'keyDown' : 'rawKeyDown',
        key: input.key,
        code: input.code,
        windowsVirtualKeyCode: input.keyCode,
        nativeVirtualKeyCode: input.keyCode,
        modifiers,
        ...(text && input.type === 'keyDown' ? { text, unmodifiedText: text } : {}),
        ...(input.repeat ? { autoRepeat: true } : {}),
        ...(input.location ? { location: input.location } : {}),
        ...(editing.length && input.type === 'keyDown' ? { commands: editing } : {}),
      })
      .catch(() => undefined);
  }

  private async evaluate<T>(body: string): Promise<T> {
    const results = (await this.wc.executeJavaScriptInIsolatedWorld(WORLD, [
      { code: `(() => { const F = ${REFS}; ${body} })()` },
    ])) as T;
    return results;
  }

  rects(refs: string[]): Promise<Record<string, SiteRect>> {
    return this.evaluate<Record<string, SiteRect>>(`
      const out = {};
      for (const ref of ${JSON.stringify(refs.slice(0, 200))}) {
        const el = F.find(ref);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width || r.height) out[ref] = { left: r.left, top: r.top, width: r.width, height: r.height };
      }
      return out;`);
  }

  /** The ref'd (or interactive) element at a point, in site CSS px. */
  refAt(x: number, y: number): Promise<string | null> {
    return this.evaluate<string | null>(`
      const el = document.elementFromPoint(${Number(x)}, ${Number(y)});
      if (!el) return null;
      // The thing under the pointer: the control it's part of (a link, a button, a field), or
      // else the innermost element itself (a heading, a picture, a paragraph). Never a big
      // ancestor just because it has a ref or a role.
      const target = el.closest(${JSON.stringify(CONTROLS)}) || el;
      return F.refOf(target);`);
  }

  /** The element at a point and its accessible name, for "You clicked …" (§5.4). */
  elementAt(x: number, y: number): Promise<{ ref: string; label: string } | null> {
    return this.evaluate<{ ref: string; label: string } | null>(`
      const el = document.elementFromPoint(${Number(x)}, ${Number(y)});
      if (!el) return null;
      const target = el.closest('a,button,input,select,textarea,label,summary,[role],[data-ref],[data-testid]') || el;
      const type = target.getAttribute('type');
      const label = type === 'password'
        ? '[password entered]'
        : (target.getAttribute('aria-label') || target.innerText || target.getAttribute('placeholder') || target.tagName.toLowerCase()).trim().replace(/\\s+/g, ' ').slice(0, 60);
      return { ref: F.refOf(target), label };`);
  }

  /** A JPEG of the page as it is now (step shots for rewind, §5.4). */
  /** The page rendered: it has visible content and no dev-server error overlay (a broken build). */
  rendered(): Promise<boolean> {
    return this.evaluate<boolean>(
      `
      // A file the page links to (a PDF in Chrome's viewer) has no page text but isn't broken.
      if (document.contentType && document.contentType !== 'text/html') return true;
      if (document.querySelector('vite-error-overlay, nextjs-portal, #webpack-dev-server-client-overlay')) return false;
      const text = (document.body && document.body.innerText || '').trim();
      return text.length > 0 || document.querySelectorAll('img, svg, canvas').length > 0;`,
    ).catch(() => false);
  }

  async capture(): Promise<Buffer> {
    const image = await this.wc.capturePage();
    return image.toJPEG(80);
  }

  // ── Crawler operations (SPEC-phase2 §5.2, §6.1), asked for by the agent over RPC ─────────

  private path(): string {
    try {
      const u = new URL(this.wc.getURL());
      return u.pathname + u.search;
    } catch {
      return '/';
    }
  }

  /** Interactive elements with refs and accessible names (an AX-style snapshot). */
  snapshot(): Promise<AxSnapshot> {
    return this.evaluate<AxSnapshot>(`
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const text = (el) => (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
      const nameOf = (el) => {
        const aria = el.getAttribute('aria-label');
        if (aria) return aria.trim();
        const by = el.getAttribute('aria-labelledby');
        if (by) return by.split(' ').map((id) => text(document.getElementById(id) || document.createElement('i'))).join(' ').trim();
        if (el.id) {
          const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
          if (label) return text(label);
        }
        const wrapping = el.closest('label');
        if (wrapping && wrapping !== el) return text(wrapping);
        return text(el) || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || '';
      };
      const roleOf = (el) => {
        const role = el.getAttribute('role');
        if (role) return role;
        const tag = el.tagName.toLowerCase();
        if (tag === 'a') return 'link';
        if (tag === 'button' || (tag === 'input' && ['submit', 'button', 'reset'].includes(el.type))) return 'button';
        if (tag === 'select') return 'combobox';
        if (tag === 'textarea') return 'textbox';
        if (tag === 'input') return el.type === 'checkbox' ? 'checkbox' : el.type === 'radio' ? 'radio' : 'textbox';
        return tag;
      };
      const sel = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=tab],[role=switch],[role=checkbox],[role=menuitem],[tabindex]:not([tabindex="-1"])';
      const nodes = [];
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el)) continue;
        const href = el.tagName === 'A' ? el.getAttribute('href') : null;
        const region = el.closest('dialog,[role=dialog],form,nav,header,footer');
        nodes.push({
          ref: F.refOf(el),
          role: roleOf(el),
          name: nameOf(el).slice(0, 80),
          ...(el.type ? { type: el.type } : {}),
          ...(el.value !== undefined && el.type !== 'password' && typeof el.value === 'string' && el.value ? { value: el.value.slice(0, 60) } : {}),
          ...(el.disabled ? { disabled: true } : {}),
          ...(href ? { href } : {}),
          ...(region ? { region: region.tagName.toLowerCase() } : {}),
        });
        if (nodes.length >= 120) break;
      }
      return {
        url: location.href,
        path: location.pathname + location.search,
        title: document.title,
        headings: [...document.querySelectorAll('h1,h2,h3')].map(text).filter(Boolean).slice(0, 10),
        nodes,
        hasPassword: !!document.querySelector('input[type=password]'),
      };`);
  }

  private async settle(
    before: string,
  ): Promise<{ op: 'action'; path: string; navigated: boolean }> {
    await new Promise((r) => setTimeout(r, 450));
    const path = this.path();
    return { op: 'action', path, navigated: path !== before };
  }

  /**
   * Runs an action with the feedback probe armed: settles, waits (up to 10s) for the API calls
   * it started, then reads what changed on screen (§7 feedback-timing, error-message, network).
   */
  private async traced(
    ref: string,
    act: () => Promise<SiteRect | null>,
    destructive = false,
  ): Promise<{ op: 'action'; path: string; navigated: boolean; trace: OpTrace }> {
    this.gating = true;
    this.destructiveAct = destructive;
    try {
      return await this.tracedInner(ref, act);
    } finally {
      this.gating = false;
      this.destructiveAct = false;
    }
  }

  private async tracedInner(
    ref: string,
    act: () => Promise<SiteRect | null>,
  ): Promise<{ op: 'action'; path: string; navigated: boolean; trace: OpTrace }> {
    const before = this.path();
    const armed = await this.probes<boolean>('P.feedbackArm(); return true;').catch(() => false);
    const t0 = Date.now();
    this.acting = ref;
    let rect: SiteRect | null;
    try {
      rect = await act();
    } finally {
      this.acting = undefined;
    }
    const result = await this.settle(before);
    const mine = () =>
      this.drained.filter((r) => r.startMs >= t0 && (r.type === 'Fetch' || r.type === 'XHR'));
    const deadline = Date.now() + 10_000;
    // A request held for the gate isn't waited on: the user answers it later.
    const waiting = () => {
      const held = new Set(this.held.values());
      return mine().some((r) => r.endMs === null && !held.has(this.networkIds.get(r) ?? ''));
    };
    while (waiting() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    const feedback = armed
      ? await this.probes<Feedback>('return P.feedbackRead(F);').catch(() => null)
      : null;
    const requests = mine().map((r) => ({ ...r }));
    const opened = this.openedAt >= t0;
    return {
      ...result,
      trace: { feedback, requests, ...(rect ? { rect } : {}), ...(opened ? { opened } : {}) },
    };
  }

  /** Scrolls an element to the middle of the view, so the user sees what Fitts will touch. */
  reveal(ref: string): Promise<void> {
    return this.evaluate<void>(`
      const el = F.find(${JSON.stringify(ref)});
      if (el) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });`);
  }

  /** A real click at the element's center, after scrolling it into view. */
  click(ref: string, destructive = false) {
    return this.traced(ref, () => this.clickAt(ref), destructive);
  }

  private async clickAt(ref: string): Promise<SiteRect> {
    const before = this.path();
    this.focus();
    const rect = await this.evaluate<SiteRect | null>(`
      const el = F.find(${JSON.stringify(ref)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };`);
    if (!rect) throw new Error(`No element ${ref} on ${before}`);
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    this.wc.sendInputEvent({ type: 'mouseMove', x, y });
    this.wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    this.wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    return rect;
  }

  /** Focuses the field, clears it, and types like a person (char events). */
  type(ref: string, text: string) {
    return this.traced(ref, () => this.typeInto(ref, text));
  }

  private async typeInto(ref: string, text: string): Promise<null> {
    const before = this.path();
    this.focus();
    const ok = await this.evaluate<boolean>(`
      const el = F.find(${JSON.stringify(ref)});
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.focus();
      if ('select' in el) el.select();
      return true;`);
    if (!ok) throw new Error(`No field ${ref} on ${before}`);
    this.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
    this.wc.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
    for (const ch of text) {
      this.wc.sendInputEvent({ type: 'char', keyCode: ch });
      // About 25 characters a second: per-keystroke requests show up at a person's pace.
      await new Promise((r) => setTimeout(r, 40));
    }
    return null;
  }

  async press(key: string) {
    const before = this.path();
    this.focus();
    this.wc.sendInputEvent({ type: 'keyDown', keyCode: key });
    if (key.length === 1) this.wc.sendInputEvent({ type: 'char', keyCode: key });
    this.wc.sendInputEvent({ type: 'keyUp', keyCode: key });
    return this.settle(before);
  }

  async back() {
    const before = this.path();
    if (this.wc.navigationHistory.canGoBack()) this.wc.navigationHistory.goBack();
    return this.settle(before);
  }

  async goto(path: string) {
    const before = this.path();
    const url = new URL(path, this.baseUrl);
    if (url.origin !== this.origin) throw new Error('Off-origin navigation is not allowed');
    await this.load(url.pathname + url.search).catch(() => undefined);
    return this.settle(before);
  }

  destroy(): void {
    if (!this.win.isDestroyed()) this.win.destroy();
  }
}

/**
 * macOS: ⌘A, ⌘C, ⌘X, ⌘V, ⌘Z and ⇧⌘Z are menu commands there, not key handling, so the page
 * needs them named (Chromium's editing commands).
 */
function macCommand(input: Extract<SiteInput, { kind: 'key' }>): string[] {
  const shift = input.modifiers?.includes('shift');
  switch (input.code) {
    case 'KeyA':
      return ['selectAll'];
    case 'KeyC':
      return ['copy'];
    case 'KeyX':
      return ['cut'];
    case 'KeyV':
      return ['paste'];
    case 'KeyZ':
      return [shift ? 'redo' : 'undo'];
    default:
      return [];
  }
}

/** The longest JSON array in a body: top level or one level down. */
export function longestArray(body: string): number {
  try {
    const v = JSON.parse(body) as unknown;
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === 'object')
      return Math.max(0, ...Object.values(v).map((x) => (Array.isArray(x) ? x.length : 0)));
  } catch {
    // Not JSON.
  }
  return 0;
}

/** §13: DELETE; a POST to a payment path; any write from a control named like a destructive one. */
export function destructiveRequest(
  method: string,
  url: string,
  destructiveControl: boolean,
): boolean {
  const m = method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(m)) return false;
  if (m === 'DELETE' || destructiveControl) return true;
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // Keep the raw string.
  }
  return /\b(pay|payment|checkout|purchase|billing|charge|subscribe)\b/i.test(path);
}
