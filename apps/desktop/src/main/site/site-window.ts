// The user's site in a hidden offscreen window (SPEC-phase2 §5.1), streamed to the renderer as
// JPEG frames. No preload; sandboxed; a session per project; every permission denied. Fitts's
// own queries (element boxes, refs) run in an isolated world, never the page's.
import type { Feedback, PageProbeName, PageProbeResult, RequestRecord } from '@fitts/probes';
import PROBES from '@fitts/probes/page.js?raw';
import type { ProbeItem, SiteInput, SiteNav, SiteRect, SiteStatus } from '@fitts/schema';
import type { AxSnapshot, OpTrace } from '../../agent/protocol';
import { BrowserWindow, session, type WebContents } from 'electron';

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
    wc.on('will-navigate', (e, url) => {
      if (!this.allowed(url)) e.preventDefault();
    });
    wc.setWindowOpenHandler(({ url }) => {
      if (this.allowed(url)) void wc.loadURL(url);
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
  /** The control being used right now, so requests can be traced back to it. */
  private acting: string | undefined;
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
    dbg.on('message', (_e, method: string, params: Record<string, unknown>) => {
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

  input(input: SiteInput): void {
    const wc = this.wc;
    if (input.kind === 'mouse') {
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
    } else {
      wc.sendInputEvent({
        type: input.type,
        keyCode: input.keyCode,
        modifiers: input.modifiers ?? [],
      });
    }
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
      const target = el.closest('[data-ref],[data-testid],[data-fitts-ref]')
        || el.closest('a,button,input,select,textarea,label,summary,[role],[tabindex]')
        || el;
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
    while (mine().some((r) => r.endMs === null) && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 100));
    const feedback = armed
      ? await this.probes<Feedback>('return P.feedbackRead(F);').catch(() => null)
      : null;
    const requests = mine().map((r) => ({ ...r }));
    return { ...result, trace: { feedback, requests, ...(rect ? { rect } : {}) } };
  }

  /** A real click at the element's center, after scrolling it into view. */
  click(ref: string) {
    return this.traced(ref, () => this.clickAt(ref));
  }

  private async clickAt(ref: string): Promise<SiteRect> {
    const before = this.path();
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
