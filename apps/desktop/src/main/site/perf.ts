// perf_pass (SPEC-phase4 §6B.7): real-world speed on a mid-range phone. A hidden window on the
// project's dev server (the production build is cut, §13 #3; every number says "dev build"),
// at the phone's size, with Chrome DevTools' Slow 4G and a 4× slower CPU; cache off. Each page
// is loaded and its paint, layout shift, long tasks and file sizes are read from the page's own
// performance entries. No model calls; the agent turns the numbers into findings.
import { CPU_SLOWDOWN, SLOW_4G, type PagePerf } from '@fitts/probes';
import { DEVICES } from '@fitts/schema';
import { SiteWindow } from './site-window';

/** At most this many pages per run (journey pages first: the agent orders them). */
export const PERF_PAGES = 10;
/**
 * On a dev server (no production build, §13 #3) a throttled load fetches every unbundled
 * module at Slow 4G's latency, so it's slow and pessimistic: three pages, 25 s each at most.
 */
export const PERF_PAGES_DEV = 3;
const PAGE_LIMIT_MS = 30_000;
const PASS_LIMIT_MS = 100_000;

/** The promise's value, or null when it takes longer than `ms` (or fails). */
function within<T>(ms: number, p: Promise<T>): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);
}

/** One page: load it, let a slow phone paint and settle, read its entries. */
async function measure(
  win: SiteWindow,
  route: string,
): Promise<Omit<PagePerf, 'route' | 'devBuild'>> {
  await win.load(route);
  await win.wc.executeJavaScript(`(() => {${OBSERVE}})()`).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 4000));
  return (await win.wc.executeJavaScript(`(() => {${READ}})()`)) as Omit<
    PagePerf,
    'route' | 'devBuild'
  >;
}

const READ = `
  const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1);
  const cls = performance.getEntriesByType('layout-shift')
    .filter((e) => !e.hadRecentInput).reduce((s, e) => s + e.value, 0);
  const tbt = performance.getEntriesByType('longtask')
    .reduce((s, e) => s + Math.max(0, e.duration - 50), 0);
  const files = performance.getEntriesByType('resource').map((r) => ({
    url: r.name,
    type: r.initiatorType === 'img' ? 'image'
      : r.initiatorType === 'script' ? 'script'
      : r.initiatorType === 'link' && /\\.css/.test(r.name) ? 'css'
      : /\\.(woff2?|ttf|otf)/.test(r.name) ? 'font'
      : /\\.(png|jpe?g|webp|avif|gif|svg)/.test(r.name) ? 'image'
      : /\\.m?js/.test(r.name) ? 'script' : 'other',
    bytes: r.transferSize || r.encodedBodySize || 0,
  }));
  return { lcpMs: lcp ? Math.round(lcp.startTime) : undefined, cls: Math.round(cls * 1000) / 1000, tbtMs: Math.round(tbt), files };`;

/** The page's own observers, buffered, so entries from before the read still count. */
const OBSERVE = `
  for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask'])
    try { new PerformanceObserver(() => {}).observe({ type, buffered: true }); } catch {}
  return true;`;

export async function measurePerf(
  projectId: string,
  baseUrl: string,
  routes: string[],
): Promise<PagePerf[]> {
  const phone = DEVICES.find((d) => d.id === 'phone') ?? null;
  const win = new SiteWindow(
    projectId,
    baseUrl,
    () => undefined,
    () => undefined,
  );
  win.setActive(false);
  const out: PagePerf[] = [];
  try {
    if (phone) await win.emulate(phone).catch(() => undefined);
    const dbg = win.wc.debugger;
    await dbg.sendCommand('Network.enable').catch(() => undefined);
    await dbg
      .sendCommand('Network.setCacheDisabled', { cacheDisabled: true })
      .catch(() => undefined);
    await dbg.sendCommand('Network.emulateNetworkConditions', SLOW_4G).catch(() => undefined);
    await dbg
      .sendCommand('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })
      .catch(() => undefined);
    const started = Date.now();
    for (const route of routes.slice(0, Math.min(PERF_PAGES, PERF_PAGES_DEV))) {
      // The whole pass is bounded: a throttled dev server must never hold up the run.
      if (Date.now() - started > PASS_LIMIT_MS) break;
      const m = await within(PAGE_LIMIT_MS, measure(win, route));
      if (m) out.push({ route, ...m, devBuild: true });
    }
  } finally {
    win.destroy();
  }
  return out;
}
