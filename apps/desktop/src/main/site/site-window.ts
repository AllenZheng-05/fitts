// The user's site in a hidden offscreen window (SPEC-phase2 §5.1), streamed to the renderer as
// JPEG frames. No preload; sandboxed; a session per project; every permission denied. Fitts's
// own queries (element boxes, refs) run in an isolated world, never the page's.
import { ICON_PATH } from '../window';
import type { Feedback, PageProbeName, PageProbeResult, RequestRecord } from '@fitts/probes';
import PROBES from '@fitts/probes/page.js?raw';
import DETECTOR from '@fitts/probes/detector.js?raw';
import {
  faultable,
  movedOnPage,
  quietTap,
  rewrite,
  type QuietTap,
  type TapState,
  type FaultCase,
  type ViewBox,
  type SurpriseEvent,
  type TabStop,
} from '@fitts/probes';
import {
  DEVICES,
  type DeviceCell,
  type PointedElement,
  type ProbeItem,
  type SiteDevice,
  type SiteInput,
  type SiteNav,
  type SiteRect,
  type SiteStatus,
  type SourceFrame,
} from '@fitts/schema';

/** A current mobile Chrome, so sites serve their phone experience. */
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
import {
  PAYMENT_HOST,
  type AxSnapshot,
  type HeldRequest,
  type OpTrace,
} from '../../agent/protocol';
import { BrowserWindow, session, type WebContents } from 'electron';
import { cleanFrames, selectorFor, SOURCE_CHAIN_FN } from './source-chain';
import { REFS } from './refs';

/** What "Point at something" picks when the pointer is inside one: a control, as a whole. */
const CONTROLS =
  'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="switch"],[role="menuitem"],[role="option"]';

/** Isolated world for Fitts's scripts (refs, rects); the page can't see them. */
const WORLD = 1001;
/**
 * Prefixed to a script that scrolls the page: the detector counts the scrolls in the next 1.5 s
 * as Fitts's, not the page scrolling by itself (Basil & Ember, Nov 4: "the page scrolled 549 px
 * up by itself" was the Tab sweep's return to the top).
 */
const OWN_SCROLL = 'window.__fittsSurprise && window.__fittsSurprise.own(1500);';
/** A control's state as it's tapped (TapState), from `el`: a label stands for its input. */
const TAP_STATE = `(() => {
  const c = el.tagName === 'LABEL' && el.control ? el.control : el;
  const p = c.parentElement;
  const num = p && p.querySelector('input[type=number]');
  const shown = p ? /(?:^|\\s)(\\d+)(?:\\s|$)/.exec(p.innerText || '') : null;
  const count = num ? Number(num.value) : shown ? Number(shown[1]) : undefined;
  return {
    disabled: !!(c.disabled || c.closest('[aria-disabled="true"]')),
    selected: (c.type === 'radio' && c.checked) || ['aria-pressed', 'aria-checked', 'aria-selected'].some((a) => c.getAttribute(a) === 'true'),
    tag: c.tagName.toLowerCase(),
    type: c.type || undefined,
    name: (c.getAttribute('aria-label') || c.textContent || '').trim().slice(0, 60),
    count,
  };
})()`;
/** WCAG 1.4.12's text spacing, as a sheet the page gets in the text-spacing cell. */
const TEXT_SPACING_CSS =
  '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';

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
      // Never a taskbar button of its own (it would carry Electron's icon), even when focused.
      skipTaskbar: true,
      icon: ICON_PATH,
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
    // Only the project's origin here. Leaving it from your own click opens a tab beside the site
    // (SPEC-phase3 §3); from Fitts's, it's blocked and checked later by the links probe. Either
    // way the page did respond to the action that caused it (the feedback probe).
    wc.on('will-navigate', (e, url) => {
      if (this.allowed(url)) return;
      e.preventDefault();
      this.openedAt = Date.now();
      if (!this.byFitts()) this.onOffsite?.(url);
    });
    wc.setWindowOpenHandler(({ url }) => {
      if (this.allowed(url)) void wc.loadURL(url);
      else {
        this.openedAt = Date.now();
        if (!this.byFitts()) this.onOffsite?.(url);
      }
      return { action: 'deny' };
    });
    const pushHistory = () =>
      this.onStatus({
        url: wc.getURL(),
        canBack: wc.navigationHistory.canGoBack(),
        canForward: wc.navigationHistory.canGoForward(),
      });
    wc.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
      // -3 is an aborted load (a newer navigation took over), not a failure.
      if (isMainFrame && code !== -3) this.loadFailed = true;
    });
    wc.on('did-finish-load', () => {
      this.loadFailed = false;
      void this.applySpacing();
    });
    wc.on('did-navigate', pushHistory);
    wc.on('did-navigate-in-page', pushHistory);
    // SPEC-phase4 §6A: what the page logged, when it loaded and where it bounced, per action.
    wc.on('did-finish-load', () => (this.loadedAt = Date.now()));
    // SPEC-phase4 §6B.5: the surprise detector on every page, before anything happens.
    wc.on('did-finish-load', () => {
      void wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: DETECTOR }]).catch(() => undefined);
    });
    wc.on('did-redirect-navigation', (_e, url) => {
      try {
        this.redirects.push(new URL(url).pathname);
      } catch {
        // Not a URL worth noting.
      }
    });
    wc.on('console-message', (event, ...rest: unknown[]) => {
      const d = event as unknown as { level?: unknown; message?: unknown };
      const level = d.level ?? rest[0];
      const raw = d.message ?? rest[1];
      const message = typeof raw === 'string' ? raw : '';
      if (level === 'error' || level === 3) this.consoleErrors.push(message.slice(0, 120));
    });
    this.recordNetwork();
  }

  // ── Network (the network and feedback-timing probes, §7) ──────────────────────

  private requests = new Map<string, RequestRecord>();
  private drained: RequestRecord[] = [];
  /** Each record's CDP network id (held requests are matched by it). */
  private readonly networkIds = new WeakMap<RequestRecord, string>();
  /** The control being used right now, so requests can be traced back to it. */
  private acting: string | undefined;
  /** SPEC-phase4 §6B.5: when input reached the page (Fitts's and the owner's), ms since epoch. */
  private readonly inputs: number[] = [];
  private noteInput(): void {
    this.inputs.push(Date.now());
    if (this.inputs.length > 400) this.inputs.shift();
  }
  /** SPEC-phase4 §6B.6: the GET being rewritten while state_pass loads a page. */
  private fault: { endpoint: string; fault: FaultCase; hits: number } | undefined;
  /** SPEC-phase4 §6A: per-action console errors, redirect hops and the last load time. */
  private consoleErrors: string[] = [];
  private redirects: string[] = [];
  private loadedAt = 0;
  /** When the page last tried to open a new tab or leave the site (both blocked). */
  private openedAt = 0;
  /** Until when Fitts's action is in flight (its click, then the page settling). */
  private fittsUntil = 0;
  /** A link that leaves the site, followed by the user: it opens in a tab (main sets this). */
  onOffsite: ((url: string) => void) | undefined;

  /** The page is moving because Fitts acted, not you. */
  private byFitts(): boolean {
    return Date.now() < this.fittsUntil;
  }
  /** The last page load failed (offline, DNS, refused): a live site's "not answering". */
  private loadFailed = false;
  /** The device it's emulating (null: a desktop browser the panel's size). */
  private deviceId: string | null = null;

  /** The emulated device's id, "Your screen" included (null: the panel's size). */
  get deviceKey(): string | null {
    return this.deviceId;
  }

  get device(): SiteDevice | null {
    return this.cell ?? DEVICES.find((d) => d.id === this.deviceId) ?? null;
  }
  /** The device cell it's emulating (SPEC-phase4 §6.3), when it's one. */
  private cell: DeviceCell | null = null;
  /** The text-spacing CSS is on (re-inserted on every page load). */
  private spacing = false;
  private spacingKey: string | undefined;

  /** WCAG 1.4.12's spacing, as CSS the page gets after it loads. */
  private async applySpacing(): Promise<void> {
    if (!this.spacing) return;
    try {
      this.spacingKey = await this.wc.insertCSS(TEXT_SPACING_CSS);
    } catch {
      // The page is between loads: the next load tries again.
    }
  }

  /** The site's own media conditions (same-origin sheets only), one string per rule. */
  breakpoints(): Promise<string[]> {
    return this.evaluate<string[]>(`
      const out = [];
      for (const sheet of document.styleSheets) {
        let rules; try { rules = sheet.cssRules; } catch { continue; }
        const walk = (list) => { for (const r of list) {
          if (r.media && r.media.mediaText) out.push(r.media.mediaText);
          else if (r.conditionText && r.cssText.startsWith('@container')) out.push(r.conditionText);
          if (r.cssRules && out.length < 400) walk(r.cssRules);
        } };
        walk(rules);
      }
      return out;`);
  }

  /** SPEC-phase4 §6.3: the cheap probes for a cell: overflow at its width, and its own check. */
  async cellProbes(cell: DeviceCell): Promise<PageProbeResult[]> {
    const out: PageProbeResult[] = [];
    const overflow = await this.probes<ProbeItem[]>(`return P.overflow(F, ${cell.width});`);
    out.push({ probe: 'viewport-sweep', pass: overflow.length === 0, items: overflow });
    if (cell.textSpacing) {
      const items = await this.probes<ProbeItem[]>('return P.textSpacing(F);');
      out.push({ probe: 'text-spacing', pass: items.length === 0, items });
    }
    if (cell.zoom && cell.zoom > 1) {
      const items = await this.probes<ProbeItem[]>('return P.resizeText(F);');
      out.push({ probe: 'resize-text', pass: items.length === 0, items });
    }
    if (cell.orientation === 'landscape') {
      const items = await this.probes<ProbeItem[]>('return P.orientation(F);');
      out.push({ probe: 'orientation', pass: items.length === 0, items });
    }
    out.push(...(await this.runProbes(['contrast', 'target-size'])));
    return out;
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
    // SPEC-phase4 §6B.6: state_pass rewrites one of the site's own GETs, only on localhost.
    const f = this.fault;
    if (f && faultable(req, this.origin) && new URL(req.url).pathname.startsWith(f.endpoint)) {
      f.hits += 1;
      void this.applyFault(id, f.fault, params).catch(() => undefined);
      return;
    }
    if (!this.gating || !destructiveRequest(req.method, req.url, this.destructiveAct)) {
      void this.wc.debugger
        .sendCommand('Fetch.continueRequest', { requestId: id })
        .catch(() => undefined);
      return;
    }
    this.held.set(id, networkId);
    this.onHeld({ id, method: req.method, url: req.url });
  }

  /** Empty, error or slow, for one paused GET (§6B.6); writes never reach here. */
  private async applyFault(
    id: string,
    fault: FaultCase,
    params: Record<string, unknown>,
  ): Promise<void> {
    const dbg = this.wc.debugger;
    const atResponse = params['responseStatusCode'] !== undefined;
    if (fault === 'error') {
      const r = rewrite('error', { status: 200, body: '' });
      await dbg.sendCommand('Fetch.fulfillRequest', {
        requestId: id,
        responseCode: r.status,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(r.body).toString('base64'),
      });
    } else if (fault === 'slow') {
      await new Promise((res) => setTimeout(res, 3000));
      await dbg.sendCommand('Fetch.continueRequest', { requestId: id });
    } else if (!atResponse) {
      await dbg.sendCommand('Fetch.continueRequest', { requestId: id, interceptResponse: true });
    } else {
      const got = (await dbg.sendCommand('Fetch.getResponseBody', { requestId: id })) as {
        body: string;
        base64Encoded: boolean;
      };
      const body = got.base64Encoded ? Buffer.from(got.body, 'base64').toString('utf8') : got.body;
      const status = Number(params['responseStatusCode'] ?? 200);
      const r = rewrite('empty', { status, body });
      await dbg.sendCommand('Fetch.fulfillRequest', {
        requestId: id,
        responseCode: r.status,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(r.body).toString('base64'),
      });
    }
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

  // ── SPEC-phase4 §6B: detect more ─────────────────────────────────────────────

  /** A real Tab sweep: up to 200 stops, each with its box and how much of it shows. */
  async keyboardSweep(): Promise<{
    stops: TabStop[];
    facts: {
      interactive: { ref: string; selector: string; name: string }[];
      navLinks: number;
      skipLink: boolean;
    };
  }> {
    this.focus();
    // Start from the top of the page: after a blur, Chromium resumes Tab from the last focused
    // spot, and a sweep that began partway down called everything above it unreachable (found
    // auditing apps/site, Nov 2). Focusing a throwaway first element moves the starting point.
    await this.evaluate(
      OWN_SCROLL +
        "document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); const t = document.createElement('span'); t.tabIndex = -1; document.body.prepend(t); t.focus({ preventScroll: true }); t.remove(); return true;",
    );
    const facts = await this.probes<{
      interactive: { ref: string; selector: string; name: string }[];
      navLinks: number;
      skipLink: boolean;
    }>('return P.keyboardFacts(F);');
    const stops: TabStop[] = [];
    const firstRef = new Set<string>();
    // Three empty Tabs in a row: back at the address bar, the loop is done. One alone (a probe
    // that couldn't read the focused element) isn't the end (bench:chat, Nov 2: a sweep that
    // ended early read demo/chat's contacts filter and rows as unreachable).
    let empty = 0;
    for (let i = 0; i < 200; i++) {
      this.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
      this.wc.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
      await new Promise((r) => setTimeout(r, 30));
      const stop = await this.probes<TabStop | null>('return P.tabStop(F);').catch(() => null);
      if (!stop) {
        if (stops.length > 0 && ++empty >= 3) break;
        continue;
      }
      empty = 0;
      // Around once: the sweep is complete.
      if (firstRef.has(stop.ref) && stops.length > 3 && stops.at(-1)?.ref !== stop.ref) break;
      firstRef.add(stop.ref);
      stops.push(stop);
    }
    await this.evaluate(
      OWN_SCROLL +
        'document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); return true;',
    );
    return { stops, facts };
  }

  /** An open dialog: does focus move in, stay in on Tab, does Esc close it, does focus return? */
  async dialogCheck(): Promise<{
    ref: string;
    selector: string;
    name: string;
    focusMovedIn: boolean;
    tabStaysIn: boolean;
    escCloses: boolean;
    focusReturned: boolean;
  } | null> {
    type D = { ref: string; selector: string; name: string; focusInside: boolean } | null;
    const d = await this.probes<D>('return P.dialogState(F);').catch(() => null);
    if (!d) return null;
    const focusMovedIn = d.focusInside;
    this.focus();
    let tabStaysIn = true;
    for (let i = 0; i < 8; i++) {
      this.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
      this.wc.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
      await new Promise((r) => setTimeout(r, 30));
      const s = await this.probes<D>('return P.dialogState(F);').catch(() => null);
      if (s && !s.focusInside) {
        tabStaysIn = false;
        break;
      }
    }
    this.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    this.wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await new Promise((r) => setTimeout(r, 200));
    const after = await this.probes<D>('return P.dialogState(F);').catch(() => null);
    const escCloses = after === null;
    const focusReturned = escCloses
      ? await this.evaluate<boolean>('return document.activeElement !== document.body;').catch(
          () => false,
        )
      : true;
    return {
      ref: d.ref,
      selector: d.selector,
      name: d.name,
      focusMovedIn,
      tabStaysIn,
      escCloses,
      focusReturned,
    };
  }

  /** What the page shows (after loading `path` fresh, when given). */
  async facts(path?: string): Promise<{
    status: number;
    mainText: number;
    errorText?: string;
    headings: string[];
    text: string;
    path: string;
  }> {
    if (path) {
      // Loaded, then refreshed: what a refresh or a returning visitor sees (§6B.4).
      await this.load(path).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 400));
      await this.reloadAndCheck().catch(() => false);
      await new Promise((r) => setTimeout(r, 700));
    }
    const f = await this.probes<{
      status: number;
      mainText: number;
      errorText?: string;
      headings: string[];
      text: string;
    }>('return P.pageFacts();');
    return { ...f, path: this.path() };
  }

  /** The detector's events since the last read, and the input times on its clock (ms). */
  async surpriseEvents(): Promise<{
    events: SurpriseEvent[];
    inputs: number[];
    clock?: number;
  }> {
    const r = await this.evaluate<{
      events: SurpriseEvent[];
      now: number;
    } | null>(
      'const S = window.__fittsSurprise; if (!S) return null; return { events: S.take(), now: performance.now() - S.startedAt };',
    ).catch(() => null);
    if (!r) return { events: [], inputs: [] };
    const wall = Date.now();
    return {
      events: r.events,
      inputs: this.inputs.map((t) => Math.round(r.now - (wall - t))),
      clock: wall - r.now,
    };
  }

  /** state_pass: load `route` with one GET rewritten; what it shows, and a shot. */
  async faultLoad(
    route: string,
    endpoint: string,
    fault: FaultCase,
  ): Promise<{
    facts: {
      status: number;
      mainText: number;
      errorText?: string;
      headings: string[];
      text: string;
      path: string;
    };
    uncaught: number;
    busyWithin1s: boolean;
    /** The page made the request at all (a search only asks when you type). */
    hit: boolean;
    jpegBase64?: string;
    results: PageProbeResult[];
  }> {
    const state = { endpoint, fault, hits: 0 };
    this.fault = state;
    this.consoleErrors = [];
    try {
      void this.load(route).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 1000));
      const busyWithin1s = await this.evaluate<boolean>(
        "return !!document.querySelector('[aria-busy=true],[role=progressbar],.spinner,.loading') || /loading|searching|please wait/i.test(document.body.innerText);",
      ).catch(() => false);
      await new Promise((r) => setTimeout(r, fault === 'slow' ? 3000 : 800));
      const facts = await this.facts();
      const results = await this.runProbes(['placeholder-leak']).catch(() => []);
      const jpeg = await this.capture().catch(() => undefined);
      return {
        facts,
        uncaught: this.consoleErrors.length,
        busyWithin1s,
        hit: state.hits > 0,
        ...(jpeg ? { jpegBase64: jpeg.toString('base64') } : {}),
        results,
      };
    } finally {
      this.fault = undefined;
      await this.load(route).catch(() => undefined);
    }
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
  async emulate(device: SiteDevice | DeviceCell | null): Promise<void> {
    const dbg = this.wc.debugger;
    // The same device again (a layout change remounts the canvas) changes nothing.
    if (!dbg.isAttached() || (device?.id ?? null) === this.deviceId) return;
    this.deviceId = device?.id ?? null;
    this.cell = device && 'touch' in device ? device : null;
    // SPEC-phase4 §6.3: what a cell emulates beyond its size.
    const cell = this.cell;
    this.wc.setZoomFactor(cell?.zoom ?? 1);
    this.spacing = Boolean(cell?.textSpacing);
    const features = [
      ...(cell?.scheme ? [{ name: 'prefers-color-scheme', value: cell.scheme }] : []),
      ...(cell?.motion ? [{ name: 'prefers-reduced-motion', value: cell.motion }] : []),
    ];
    await dbg.sendCommand('Emulation.setEmulatedMedia', { features }).catch(() => undefined);
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

  /** The page is loaded and its renderer answers (a live site's health; no server to ask). */
  async responsive(): Promise<boolean> {
    if (this.loadFailed || this.wc.isCrashed()) return false;
    const answer = this.wc.executeJavaScript('document.readyState', false).then(
      () => true,
      () => false,
    );
    const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), 5000));
    return Promise.race([answer, timeout]);
  }

  /** Loads the page again and says whether it came back. */
  async reloadAndCheck(): Promise<boolean> {
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 20_000);
      this.wc.once('did-stop-loading', done);
      this.wc.reload();
    });
    return this.responsive();
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
    if (input.kind !== 'focus') this.noteInput();
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

  /** The ref'd (or interactive) element at a point, in site CSS px, with what it is. */
  refAt(x: number, y: number): Promise<PointedElement | null> {
    return this.evaluate<PointedElement | null>(`
      const el = document.elementFromPoint(${Number(x)}, ${Number(y)});
      if (!el) return null;
      // The thing under the pointer: the control it's part of (a link, a button, a field), or
      // else the innermost element itself (a heading, a picture, a paragraph). Never a big
      // ancestor just because it has a ref or a role.
      const target = el.closest(${JSON.stringify(CONTROLS)}) || el;
      const tag = target.tagName.toLowerCase();
      const type = (target.getAttribute('type') || '').toLowerCase();
      const role = target.getAttribute('role') || '';
      const text = (target.innerText || '').trim();
      const kind =
        tag === 'a' || role === 'link' ? 'link'
        : tag === 'button' || tag === 'summary' || ['button', 'tab', 'menuitem'].includes(role) || ['submit', 'button'].includes(type) ? 'button'
        : tag === 'select' || role === 'option' ? 'dropdown'
        : ['checkbox', 'radio'].includes(type) || ['checkbox', 'switch'].includes(role) ? 'checkbox'
        : tag === 'input' || tag === 'textarea' ? 'field'
        : ['img', 'svg', 'picture', 'video', 'canvas'].includes(tag) ? 'image'
        : /^h[1-6]$/.test(tag) ? 'heading'
        : ['p', 'span', 'li', 'label', 'strong', 'em', 'small', 'blockquote', 'td'].includes(tag) ? 'text'
        // A box holding one short line ("To: Grandma") reads as text; a bigger one is a section.
        : text && text.length <= 60 && !text.includes('\\n') ? 'text'
        : 'section';
      const label = target.labels && target.labels[0] ? target.labels[0].innerText : '';
      // A password field is named, never read; a big section has no one name worth showing.
      const raw = type === 'password' ? '' :
        target.getAttribute('aria-label') || target.getAttribute('alt') || label ||
        (kind === 'section' ? '' : text) || target.getAttribute('placeholder') ||
        target.getAttribute('title') || '';
      const name = raw.trim().replace(/\\s+/g, ' ');
      return { ref: F.refOf(target), kind, name: name.length > 48 ? name.slice(0, 47) + '…' : name };`);
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
      // A control's key says which control it is across re-renders, and which controls are
      // the same component repeated (a card in a list of cards): those share one key.
      const shape = (el) => el.tagName.toLowerCase() + [...el.classList].map((c) => c.replace(/[0-9]+/g, '')).filter(Boolean).sort().map((c) => '.' + c).join('');
      const near = (el, stop) => {
        const parts = [];
        for (let x = el, i = 0; x && x !== stop && i < 4; x = x.parentElement, i++) parts.push(shape(x));
        return parts.join('<');
      };
      const card = (el) => {
        let a = el.parentElement;
        for (let depth = 0; a && a !== document.body && depth < 8; a = a.parentElement, depth++) {
          const p = a.parentElement;
          if (!p) break;
          const s = shape(a);
          let same = 0;
          for (const c of p.children) if (shape(c) === s) same++;
          // A card holds more than the control: other controls, or text of its own.
          if (same >= 3 && (a.querySelectorAll(sel).length > 1 || text(a).length > text(el).length + 20)) return a;
        }
        return null;
      };
      const keyOf = (el, role, name) => {
        const c = card(el);
        if (c) return 'card:' + shape(c.parentElement) + '>' + shape(c) + '>' + near(el, c) + '|' + role;
        return role + '|' + name + '|' + near(el, null);
      };
      const nodes = [];
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el)) continue;
        const href = el.tagName === 'A' ? el.getAttribute('href') : null;
        const region = el.closest('dialog,[role=dialog],form,nav,header,footer');
        const role = roleOf(el);
        const name = nameOf(el).slice(0, 80);
        nodes.push({
          ref: F.refOf(el),
          role,
          name,
          key: keyOf(el, role, name).slice(0, 300),
          ...(el.type ? { type: el.type } : {}),
          ...(el.value !== undefined && el.type !== 'password' && typeof el.value === 'string' && el.value ? { value: el.value.slice(0, 60) } : {}),
          ...(F.options(el) ? { options: F.options(el) } : {}),
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
        hours: F.hours(document.body.innerText),
        payments: [...new Set([...document.querySelectorAll('iframe[src],script[src],form[action]')].map((e) => {
          try { return new URL(e.getAttribute('src') || e.getAttribute('action') || '', location.href).host; } catch { return ''; }
        }).filter((h) => new RegExp(${JSON.stringify(PAYMENT_HOST.source)}, 'i').test(h)))].slice(0, 5),
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
    this.consoleErrors = [];
    this.redirects = [];
    this.loadedAt = 0;
    this.lastMoved = undefined;
    this.lastQuiet = undefined;
    this.acting = ref;
    this.fittsUntil = t0 + 15_000;
    let rect: SiteRect | null;
    try {
      rect = await act();
    } finally {
      this.acting = undefined;
    }
    const result = await this.settle(before).finally(() => (this.fittsUntil = 0));
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
    // Settled: the later of the last DOM change and the last request's end, plus the 300 ms of
    // quiet that proved it (null when nothing changed and nothing was asked for).
    const lastReq = Math.max(0, ...requests.map((r) => (r.endMs ?? r.startMs) - t0));
    const lastChange = feedback?.lastChangeMs ?? null;
    const settledMs =
      lastChange === null && requests.length === 0
        ? null
        : Math.max(lastChange ?? 0, lastReq) + 300;
    const navigationMs = result.navigated && this.loadedAt >= t0 ? this.loadedAt - t0 : null;
    const errors = this.consoleErrors;
    const redirects = this.redirects;
    return {
      ...result,
      trace: {
        feedback,
        requests,
        ...(rect ? { rect } : {}),
        ...(opened ? { opened } : {}),
        settledMs,
        navigationMs,
        console: { errors: errors.length, ...(errors[0] ? { first: errors[0] } : {}) },
        ...(redirects.length ? { redirects: [...redirects] } : {}),
        ...(this.lastMoved ? { moved: this.lastMoved } : {}),
        ...(this.lastQuiet ? { quiet: this.lastQuiet } : {}),
      },
    };
  }

  /**
   * The element's component chain (SPEC-phase4 §2.2), read in the page's main world through
   * the DevTools protocol (React's fiber lives on the DOM node as an expando the isolated
   * world can't see). Read-only; the result is page data and is cleaned before use.
   */
  async sourceOf(ref: string): Promise<SourceFrame[]> {
    return (await this.sourcesOf([ref]))[ref] ?? [];
  }

  /** Many elements' chains in one evaluation (a page's first visit), by ref. */
  async sourcesOf(refs: string[]): Promise<Record<string, SourceFrame[]>> {
    const dbg = this.wc.debugger;
    const list = [...new Set(refs)].slice(0, 200);
    if (!dbg.isAttached() || list.length === 0) return {};
    const selectors = list.map((r) => selectorFor(r));
    const expression = `(${JSON.stringify(selectors)}).map((s) => (${SOURCE_CHAIN_FN})(s))`;
    const res = (await dbg
      .sendCommand('Runtime.evaluate', { expression, returnByValue: true, timeout: 3000 })
      .catch(() => null)) as { result?: { value?: unknown } } | null;
    const value = res?.result?.value;
    const out: Record<string, SourceFrame[]> = {};
    if (!Array.isArray(value)) return out;
    list.forEach((ref, i) => {
      const frames = cleanFrames(value[i]);
      if (frames.length) out[ref] = frames;
    });
    return out;
  }

  /** Scrolls an element to the middle of the view, so the user sees what Fitts will touch. */
  reveal(ref: string): Promise<void> {
    return this.evaluate<void>(`${OWN_SCROLL}
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
    // Instant, whatever the site's scroll-behavior: a smooth scroll still running 150 ms later
    // moved the target in the view and the click with it (Basil & Ember, Nov 4).
    const box = `const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, scrollX, scrollY };`;
    const rect = await this.evaluate<(ViewBox & { tap: TapState }) | null>(`${OWN_SCROLL}
      const el = F.find(${JSON.stringify(ref)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const tap = ${TAP_STATE};
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, scrollX, scrollY, tap };`);
    if (!rect) throw new Error(`No element ${ref} on ${before}`);
    this.lastQuiet = quietTap(rect.tap);
    const x0 = Math.round(rect.left + rect.width / 2);
    const y0 = Math.round(rect.top + rect.height / 2);
    // Reach for it like a person: move there, a beat, then press (§6B.5: did it move away?).
    this.noteInput();
    this.wc.sendInputEvent({ type: 'mouseMove', x: x0, y: y0 });
    await new Promise((r) => setTimeout(r, 150));
    const now = await this.evaluate<ViewBox | null>(
      `
      const el = F.find(${JSON.stringify(ref)});
      if (!el) return null;
      ${box}`,
    ).catch(() => null);
    const at = now ?? rect;
    const x = Math.round(at.left + at.width / 2);
    const y = Math.round(at.top + at.height / 2);
    // Did it move on the page? A scroll moves it in the view only (§6B.5).
    this.lastMoved = movedOnPage(rect, at);
    this.wc.sendInputEvent({ type: 'mouseMove', x, y });
    this.wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    this.wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    return { left: at.left, top: at.top, width: at.width, height: at.height };
  }

  /** Why the last click's control could rightly change nothing (disabled, chosen, a picker). */
  private lastQuiet: QuietTap | undefined;

  /** The last click's target moved while Fitts reached for it (§6B.5). */
  private lastMoved:
    { decided: { x: number; y: number }; tapped: { x: number; y: number } } | undefined;

  /** Focuses the field, clears it, and types like a person (char events). */
  type(ref: string, text: string) {
    return this.traced(ref, () => this.typeInto(ref, text));
  }

  private async typeInto(ref: string, text: string): Promise<null> {
    const before = this.path();
    this.noteInput();
    this.focus();
    const how = await this.evaluate<'set' | 'keys' | null>(`${OWN_SCROLL}
      const el = F.find(${JSON.stringify(ref)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      el.focus();
      if (F.pick(el, ${JSON.stringify(text)})) return 'set';
      if ('select' in el) el.select();
      return 'keys';`);
    if (!how) throw new Error(`No field ${ref} on ${before}`);
    // A select or a date, time or month field takes a choice, not keystrokes: F.pick made one.
    if (how === 'set') return null;
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
