// The user's site in a hidden offscreen window (SPEC-phase2 §5.1), streamed to the renderer as
// JPEG frames. No preload; sandboxed; a session per project; every permission denied. Fitts's
// own queries (element boxes, refs) run in an isolated world, never the page's.
import type { SiteInput, SiteNav, SiteRect, SiteStatus } from '@fitts/schema';
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

  destroy(): void {
    if (!this.win.isDestroyed()) this.win.destroy();
  }
}
