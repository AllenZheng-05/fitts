// Tabs in the mirror (SPEC-phase3 §3): the site is tab 1 and always open; links that leave it,
// and new windows a page opens from your clicks, open in tabs beside it. Each off-site tab is its
// own offscreen window in the project's session (so a sign-in made there is the site's too),
// streamed only while it's the one showing. Fitts never acts in them.
import { BrowserWindow, type WebContents } from 'electron';
import type { SiteTab } from '@fitts/schema';

/** The site's tab is always there; this many off-site tabs at most beside it (§3.1). */
export const MAX_OFFSITE_TABS = 5;
export const SITE_TAB = 'site';

interface Tab {
  id: string;
  win: BrowserWindow;
  title: string;
  url: string;
}

export interface TabHost {
  /** The project's session partition, shared with the site window. */
  partition: string;
  /** The site's origin: an off-site tab that lands back on it hands the page to tab 1. */
  siteOrigin: string;
  frame(jpeg: Buffer, width: number, height: number): void;
  /** The strip or the active tab's address changed. */
  changed(): void;
  cursor(type: string): void;
  /** A sign-in that returns to the site: the site tab loads where it landed. */
  returnToSite(url: string): void;
  /** The oldest off-site tab closed to make room. */
  closedOldest(title: string): void;
  /** The site's tab size, so a new tab matches it. */
  size(): [number, number];
}

const sameOrigin = (url: string, origin: string) => {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
};

export class TabSet {
  private readonly tabs: Tab[] = [];
  private seq = 0;
  active = SITE_TAB;

  constructor(private readonly host: TabHost) {}

  /** Opens `url` in a new off-site tab and shows it. Only http(s). */
  open(url: string): void {
    if (!/^https?:\/\//i.test(url)) return;
    if (this.tabs.length >= MAX_OFFSITE_TABS) {
      const oldest = this.tabs[0];
      if (oldest) {
        this.close(oldest.id);
        this.host.closedOldest(oldest.title || hostOf(oldest.url));
      }
    }
    this.seq += 1;
    const id = `t${this.seq}`;
    const [width, height] = this.host.size();
    const win = new BrowserWindow({
      width,
      height,
      show: false,
      useContentSize: true,
      webPreferences: {
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        partition: this.host.partition,
      },
    });
    const tab: Tab = { id, win, title: hostOf(url), url };
    this.tabs.push(tab);
    const wc = win.webContents;
    wc.setFrameRate(30);
    wc.on('paint', (_e, _dirty, image) => {
      if (this.active !== id) return;
      const { width: w, height: h } = image.getSize();
      if (w && h) this.host.frame(image.toJPEG(80), w, h);
    });
    wc.on('cursor-changed', (_e, type) => {
      if (this.active === id) this.host.cursor(type);
    });
    wc.on('page-title-updated', (_e, title) => {
      tab.title = title.slice(0, 80);
      this.host.changed();
    });
    const moved = () => {
      const now = wc.getURL();
      // Back on the site (a sign-in returning): the site's tab takes it from here.
      if (sameOrigin(now, this.host.siteOrigin)) {
        this.host.returnToSite(now);
        this.close(id);
        return;
      }
      tab.url = now;
      this.host.changed();
    };
    wc.on('did-navigate', moved);
    wc.on('did-navigate-in-page', moved);
    wc.on('will-redirect', (e, next) => {
      if (!sameOrigin(next, this.host.siteOrigin)) return;
      e.preventDefault();
      this.host.returnToSite(next);
      this.close(id);
    });
    // A page here opening another window: another tab (the limit still applies).
    wc.setWindowOpenHandler(({ url: next }) => {
      if (sameOrigin(next, this.host.siteOrigin)) this.host.returnToSite(next);
      else this.open(next);
      return { action: 'deny' };
    });
    // Off-site pages get no permissions either (camera, location, notifications).
    wc.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    void wc.loadURL(url).catch(() => undefined);
    this.select(id);
  }

  select(id: string): void {
    if (id !== SITE_TAB && !this.tabs.some((t) => t.id === id)) return;
    this.active = id;
    this.activeTab()?.webContents.invalidate();
    this.host.changed();
  }

  /** Closes an off-site tab. The site's tab can't be closed (§3.1). */
  close(id: string): void {
    const i = this.tabs.findIndex((t) => t.id === id);
    const tab = this.tabs[i];
    if (!tab) return;
    this.tabs.splice(i, 1);
    if (!tab.win.isDestroyed()) tab.win.destroy();
    if (this.active === id) this.active = this.tabs[i - 1]?.id ?? SITE_TAB;
    this.activeTab()?.webContents.invalidate();
    this.host.changed();
  }

  /** The off-site tab showing, or undefined when it's the site. */
  activeTab(): BrowserWindow | undefined {
    return this.tabs.find((t) => t.id === this.active)?.win;
  }

  activeWc(): WebContents | undefined {
    const w = this.activeTab();
    return w && !w.isDestroyed() ? w.webContents : undefined;
  }

  resize(width: number, height: number): void {
    for (const t of this.tabs) if (!t.win.isDestroyed()) t.win.setContentSize(width, height);
  }

  /** The strip: the site first, then the off-site tabs in the order they opened. */
  list(siteTitle: string, siteUrl: string): SiteTab[] {
    return [
      { id: SITE_TAB, title: siteTitle, url: siteUrl, site: true },
      ...this.tabs.map((t) => ({
        id: t.id,
        title: t.title || hostOf(t.url),
        url: t.url,
        site: false,
      })),
    ];
  }

  get count(): number {
    return this.tabs.length;
  }

  destroy(): void {
    for (const t of this.tabs) if (!t.win.isDestroyed()) t.win.destroy();
    this.tabs.length = 0;
    this.active = SITE_TAB;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
