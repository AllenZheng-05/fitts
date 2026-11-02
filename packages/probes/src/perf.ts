// perf_pass (SPEC-phase4 §6B.7): real-world speed on a mid-range phone. Pure thresholds and the
// fix check; main does the measuring in a throttled hidden window.

/**
 * Chrome DevTools' "Slow 4G" preset (front_end/core/sdk/NetworkManager.ts, Chrome 13x): 1.6
 * Mbit/s down with 150 ms latency, scaled by DevTools' 0.9 and 1.0 factors as Chrome does.
 */
export const SLOW_4G = {
  offline: false,
  latency: 150 * 3.75,
  downloadThroughput: ((1.6 * 1000 * 1000) / 8) * 0.9,
  uploadThroughput: ((750 * 1000) / 8) * 0.9,
};
export const CPU_SLOWDOWN = 4;

export interface PagePerf {
  route: string;
  lcpMs?: number;
  inpMs?: number;
  cls?: number;
  tbtMs?: number;
  /** SPA page change: click → URL change → main content settled. */
  pageChangeMs?: number;
  /** Bytes per file that's an image or script. */
  files: { url: string; type: 'image' | 'script' | 'css' | 'font' | 'other'; bytes: number }[];
  /** Built like production, or measured on the dev server. */
  devBuild: boolean;
}

export interface PerfItem {
  metric: 'lcp' | 'inp' | 'cls' | 'tbt' | 'page-change' | 'big-file';
  measured: string;
  expected: string;
  value: number;
  limit: number;
}

/** Core Web Vitals' "good" limits and the spec's others. */
export const LIMITS = {
  lcp: 2500,
  inp: 200,
  cls: 0.1,
  tbt: 300,
  'page-change': 1000,
  'big-file': 500 * 1024,
};

const where = (devBuild: boolean) =>
  `on a mid-range phone on Slow 4G${devBuild ? ' (dev build)' : ''}`;

export function perfProblems(p: PagePerf): PerfItem[] {
  const out: PerfItem[] = [];
  const at = where(p.devBuild);
  const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const ms = (v: number) => `${Math.round(v)} ms`;
  const check = (
    metric: Exclude<PerfItem['metric'], 'big-file'>,
    value: number | undefined,
    what: string,
    show: (v: number) => string,
  ) => {
    const limit = LIMITS[metric];
    if (value === undefined || value <= limit) return;
    out.push({
      metric,
      value,
      limit,
      measured: `${what} ${show(value)} ${at}`,
      expected: `${what} under ${show(limit)}`,
    });
  };
  check('lcp', p.lcpMs, 'the main content shows after', s);
  check('inp', p.inpMs, 'the page answers a tap in', ms);
  check('cls', p.cls, 'layout shift adds up to', (v) => v.toFixed(2));
  check('tbt', p.tbtMs, 'the page is blocked for', ms);
  check('page-change', p.pageChangeMs, 'a page change takes', s);
  for (const f of p.files)
    if ((f.type === 'image' || f.type === 'script') && f.bytes > LIMITS['big-file'])
      out.push({
        metric: 'big-file',
        value: f.bytes,
        limit: LIMITS['big-file'],
        measured: `${f.url.split('/').pop() ?? f.url} is ${Math.round(f.bytes / 1024)} KB`,
        expected: 'under 500 KB',
      });
  return out;
}

/** The median of three measurements. */
export const median3 = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? NaN;
};

/** A perf fix passes when the median of 3 beats the limit by 10% (§6B.7). */
export function perfFixPasses(metric: PerfItem['metric'], measurements: number[]): boolean {
  return median3(measurements) <= LIMITS[metric] * 0.9;
}
