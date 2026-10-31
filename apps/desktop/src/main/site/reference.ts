// A site the owner admires, as design inspiration for a redesign (docs/DECISIONS.md): opened
// once in a hidden, sandboxed window with its own throwaway session, screenshotted at the top and
// one screen down, and summarized (fonts, colors, corners). Nothing on it is clicked, nothing it
// asks for is granted, and nothing it downloads or opens is allowed.
import { BrowserWindow, session } from 'electron';

const SIZE = { width: 1440, height: 900 };
const LOAD_MS = 20_000;
const SETTLE_MS = 1500;

export interface Reference {
  ok: boolean;
  url: string;
  /** JPEGs, base64: the top of the page and one screen down. */
  shots: string[];
  /** Fonts, colors, corners and shadows the page uses, in a line. */
  style: string;
  error?: string;
}

const STYLE_JS = `(() => {
  const pick = (sel) => document.querySelector(sel);
  const font = (el) => el ? getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim() : '';
  const colors = new Map();
  for (const el of [...document.querySelectorAll('body, body *')].slice(0, 1500)) {
    const s = getComputedStyle(el);
    for (const c of [s.color, s.backgroundColor]) if (c && !c.endsWith(', 0)') && c !== 'transparent') colors.set(c, (colors.get(c) || 0) + 1);
  }
  const top = [...colors].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
  const btn = pick('button, a[class*="btn"], a[class*="button"], [role="button"]');
  const card = pick('[class*="card"], article, section > div');
  const r = (el) => el ? getComputedStyle(el).borderRadius : '';
  return 'headings ' + font(pick('h1, h2')) + ', body ' + font(document.body) +
    '; colors ' + top.join(' ') + '; button radius ' + r(btn) + ', card radius ' + r(card) +
    '; card shadow ' + (card ? getComputedStyle(card).boxShadow : '');
})()`;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Only plain web pages: http(s), not Fitts's own or local files. */
export function referenceUrl(raw: string): URL | null {
  try {
    const url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

export async function captureReference(raw: string): Promise<Reference> {
  const url = referenceUrl(raw);
  if (!url) return { ok: false, url: raw, shots: [], style: '', error: 'not a web address' };
  const ses = session.fromPartition(`fitts-reference-${Date.now()}`, { cache: false });
  ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  ses.on('will-download', (e) => e.preventDefault());
  const win = new BrowserWindow({
    ...SIZE,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.setAudioMuted(true);
  try {
    await Promise.race([
      win.loadURL(url.href),
      wait(LOAD_MS).then(() => {
        throw new Error('it took too long to load');
      }),
    ]);
    await wait(SETTLE_MS);
    const shot = async () =>
      (await win.webContents.capturePage()).resize({ width: 1280 }).toJPEG(70).toString('base64');
    const shots = [await shot()];
    await win.webContents.executeJavaScript('window.scrollTo(0, window.innerHeight)');
    await wait(600);
    shots.push(await shot());
    const style = String(await win.webContents.executeJavaScript(STYLE_JS)).slice(0, 400);
    return { ok: true, url: url.href, shots, style };
  } catch (e) {
    return { ok: false, url: url.href, shots: [], style: '', error: (e as Error).message };
  } finally {
    win.destroy();
    void ses.clearStorageData().catch(() => undefined);
  }
}
