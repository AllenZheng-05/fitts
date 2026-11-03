// Baseline arm (a), docs/bench/PLAN.md: axe-core alone on demo/chat, every rule axe runs by
// default, on the pre-registered routes at desktop 1280×800 and phone 390×844. Each violated rule
// on a route is one finding (its help as the title, its description as the text, the first
// node's data-ref as the element), scored with the same matcher as Fitts. Free: no models.
//   pnpm --filter @fitts/desktop exec playwright test -c playwright.bench.config.ts axe-arm
import AxeBuilder from '@axe-core/playwright';
import { chromium, expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Finding, Severity } from '@fitts/schema';
import { report, score } from './planted';

// Another app (the held-out one, blind): AXE_ARM_URL is its running dev server, AXE_ARM_ROUTES the
// routes Fitts's own run reached, AXE_ARM_NAME the output's name, and AXE_ARM_SCORE=0 records the
// findings without scoring them (its answer key stays sealed until it's revealed).
const ROUTES = process.env['AXE_ARM_ROUTES']?.split(',').filter(Boolean) ?? [
  '/',
  '/compose',
  '/compose/recipient',
  '/compose/confirm',
  '/search',
  '/contacts',
  '/contacts/grandma',
  '/settings',
];
const NAME = process.env['AXE_ARM_NAME'] ?? 'demo-chat';
const SCORE = process.env['AXE_ARM_SCORE'] !== '0';
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
];
const PORT = Number(process.env['AXE_ARM_PORT'] ?? 5191);
const IMPACT: Record<string, Severity> = { critical: 4, serious: 3, moderate: 2, minor: 1 };
const S1 = new Set([1, 7, 8, 9, 10, 11, 12, 17, 19, 20, 23, 24, 26, 27, 28, 29, 31, 32, 33]);

test('baseline arm (a): axe alone', async () => {
  test.setTimeout(10 * 60_000);
  const root = resolve(__dirname, '../../../..');
  const base = process.env['AXE_ARM_URL'] ?? `http://localhost:${PORT}`;
  const server = process.env['AXE_ARM_URL']
    ? undefined
    : spawn(
        'pnpm',
        [
          '--filter',
          'demo-chat',
          'exec',
          'vite',
          '--configLoader',
          'runner',
          '--port',
          String(PORT),
          '--strictPort',
        ],
        { cwd: root, shell: process.platform === 'win32', stdio: 'ignore' },
      );
  const started = Date.now();
  try {
    for (let i = 0; i < 60; i++) {
      const up = await fetch(`${base}/`)
        .then((r) => r.ok)
        .catch(() => false);
      if (up) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    const browser = await chromium.launch(
      process.env['PW_CHANNEL'] ? { channel: process.env['PW_CHANNEL'] } : { channel: 'msedge' },
    );
    const byKey = new Map<string, Finding>();
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      for (const route of ROUTES) {
        await page.goto(`${base}${route}`);
        // demo/chat's lists load late; give them time, as Fitts's crawl does.
        await page.waitForTimeout(3500);
        const results = await new AxeBuilder({ page }).analyze();
        for (const v of results.violations) {
          const key = `${v.id}|${route}`;
          if (byKey.has(key)) continue;
          const target = v.nodes[0]?.target[0];
          const ref =
            typeof target === 'string'
              ? await page
                  .$eval(target, (el) => el.closest('[data-ref]')?.getAttribute('data-ref') ?? null)
                  .catch(() => null)
              : null;
          byKey.set(key, {
            id: `axe-${byKey.size + 1}`,
            runId: 'axe',
            severity: IMPACT[v.impact ?? 'minor'] ?? 1,
            heuristic: 'H4',
            lens: 'accessibility',
            title: v.help,
            finding: v.description,
            fix: '',
            route,
            elementRef: ref,
            evidence: [],
            agreement: { agreeing: 0, total: 0, who: ['axe'] },
            status: 'open',
            stepIndex: 0,
            lane: 'shown',
          } as unknown as Finding);
        }
      }
      await page.close();
    }
    await browser.close();
    const findings = [...byKey.values()];
    const wallBlind = Math.round((Date.now() - started) / 1000);
    const out = resolve(__dirname, '../../../../.fitts-dev/bench');
    mkdirSync(out, { recursive: true });
    if (!SCORE) {
      const at = new Date().toISOString();
      const bySev = [4, 3, 2, 1].map(
        (n) => `sev${n}=${findings.filter((f) => f.severity === n).length}`,
      );
      console.log(
        `AXE-ARM blind name=${NAME} at=${at} findings=${findings.length} ${bySev.join(' ')} wall=${wallBlind}s cost=0`,
      );
      writeFileSync(
        join(out, `axe-${NAME}.json`),
        JSON.stringify({ at, routes: ROUTES, findings }, null, 2),
      );
      expect(findings.length).toBeGreaterThanOrEqual(0);
      return;
    }
    const s = score(findings);
    const m1 = s.matched.filter((m) => S1.has(m.planted.n)).length;
    const shown = findings.length;
    const sev2 = findings.filter((f) => f.severity >= 2);
    const matched = new Set(s.matched.map((m) => m.finding.id));
    const wall = Math.round((Date.now() - started) / 1000);
    const at = new Date().toISOString();
    console.log(`\n${report(s)}`);
    console.log(
      `AXE-ARM at=${at} recall=${s.matched.length}/33 S1=${m1}/19 S2=${s.matched.length - m1}/14 shown=${shown} precisionStrict=${(s.matched.length / Math.max(1, shown)).toFixed(3)} precisionSev2=${(sev2.filter((f) => matched.has(f.id)).length / Math.max(1, sev2.length)).toFixed(3)} unplannedSev2=${s.falsePositives.length} wall=${wall}s cost=0`,
    );
    writeFileSync(join(out, `axe-${NAME}.json`), JSON.stringify({ at, findings }, null, 2));
    expect(findings.length).toBeGreaterThan(0);
  } finally {
    if (server?.pid) {
      // Only the server this bench started (its process tree), never anything else.
      spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
    }
  }
});
