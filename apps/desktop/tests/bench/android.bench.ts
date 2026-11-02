// `pnpm bench:android` (SPEC-phase4 §9.1): one real audit of Basil & Ember's ordering app on the
// emulator, scored against demo/basil-ember-android/PLANTED.md (A1–A9). It spends money (the
// reviewer panel and the brand check, on Economy with contributor pricing and a $2 cap) and needs
// the app's development build installed on a running emulator, from a short path (NEEDS-ALLEN
// P4-0a/b). The project folder is BENCH_ANDROID_FOLDER, else C:/Users/Plasm/bea.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { replay, type RunEvent } from '@fitts/schema';
import { launchApp, type LaunchedApp } from '../e2e/helpers/launch';
import { ANDROID_PLANTED } from './planted-android';
import { report, score } from './planted';

const FOLDER = process.env['BENCH_ANDROID_FOLDER'] ?? 'C:/Users/Plasm/bea';

let launched: LaunchedApp | undefined;

test.afterAll(async () => {
  await launched?.close({ keepUserData: true });
});

test('bench:android', async () => {
  test.setTimeout(40 * 60_000);
  launched = await launchApp({
    env: {
      FITTS_E2E_PICK_FOLDER: FOLDER,
      FITTS_SITE_PORT: '8081',
      FITTS_CRAWL_BRAIN: 'explorer',
      FITTS_OFFLINE: '0',
      FITTS_NO_DEV_KEYS: '0',
    },
  });
  const { page } = launched;
  await page.setViewportSize({ width: 1440, height: 900 });
  // The audit fits in $2. U9's fixes add about $0.90 per Muse Code pass, now that its usage is
  // counted, so the fix run gets $6.
  const capUsd = process.env['BENCH_ANDROID_FIX'] === '1' ? 6 : 2;
  await page.evaluate((capUsd) => {
    const raw = localStorage.getItem('fitts.settings');
    const saved = raw
      ? (JSON.parse(raw) as { state: Record<string, unknown>; version: number })
      : { state: {}, version: 1 };
    saved.state = { ...saved.state, modelProfile: 'economy', contributorMode: true, capUsd };
    localStorage.setItem('fitts.settings', JSON.stringify(saved));
  }, capUsd);
  await page.reload();

  await page.getByRole('button', { name: 'Browse' }).click();
  await expect(page.getByText(/Expo/)).toBeVisible();
  await page.getByRole('button', { name: 'Open my project' }).click();
  // The screen name replaces the address on Android.
  await expect(page.getByLabel('Screen')).toBeVisible({ timeout: 180_000 });
  await page
    .getByLabel('Message Fitts')
    .fill(
      'The ordering app for Basil & Ember, our wood-fired pizza place. Warm and rustic, like the restaurant: ember orange, cream and a serif logo.',
    );
  await page.getByLabel('Message Fitts').press('Enter');
  // The real interview may ask a follow-up first; then the owner skips straight to the audit.
  const start = page.getByRole('button', { name: 'Start the audit' });
  const skip = page.getByRole('button', { name: 'Skip, just look around' });
  await expect(start.or(skip).first()).toBeVisible({ timeout: 120_000 });
  if (await start.isVisible()) await start.click();
  else await skip.click();

  await expect
    .poll(
      async () => {
        const s = (await page.evaluate(async () => {
          const engine = (
            window as unknown as {
              fitts: { engine: { states(): Promise<Record<string, unknown>> } };
            }
          ).fitts.engine;
          const all = await engine.states();
          return Object.values(all)[0];
        })) as
          | { phase: string; waitingFor?: string; chat: { stateKind?: string; answer?: string }[] }
          | undefined;
        if (s?.chat.some((c) => c.stateKind === 'site-down' && c.answer === undefined))
          throw new Error('the app stopped answering (the site-down card is up)');
        // "Cancel order" is held at the gate (A5): a careful owner says no.
        if (s?.waitingFor === 'gate')
          await page
            .getByRole('alertdialog', { name: 'This could delete real data' })
            .getByRole('button', { name: "Don't do it" })
            .click({ timeout: 5000 })
            .catch(() => undefined);
        return (
          s?.phase === 'done' ||
          s?.waitingFor === 'approval' ||
          s?.waitingFor === 'finish-proposal' ||
          Boolean(s?.chat.some((c) => c.stateKind === 'nothing-found'))
        );
      },
      { timeout: 35 * 60_000, intervals: [5000] },
    )
    .toBe(true);

  const projects = join(launched.userData, 'projects');
  const project = readdirSync(projects)[0] ?? '';
  const runs = join(projects, project, 'runs');
  const run = readdirSync(runs).sort().at(-1) ?? '';
  const events = readFileSync(join(runs, run, 'events.ndjson'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => (JSON.parse(l) as { event: RunEvent }).event);
  const state = replay(events);
  const findings = state?.findings ?? [];
  const s = score(findings, ANDROID_PLANTED);
  const spent = state?.cost.spentUsd ?? 0;
  console.log(`\n${report(s)}\nSpent $${spent.toFixed(4)}\n`);
  const out = resolve(__dirname, '../../../../.fitts-dev/bench');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, 'android-live.json'),
    JSON.stringify({ at: new Date().toISOString(), spent, recall: s.recall, findings }, null, 2),
  );
  // U8's acceptance: at least 6 of the planted issues (A1–A10 now; SPEC §13 said 6 of 8).
  expect(s.matched.length).toBeGreaterThanOrEqual(6);
  if (process.env['BENCH_ANDROID_FIX'] !== '1') return;

  // U9: the owner asks for the brand fix (A9) first, then the single-control probe findings. The
  // screen-wide ones ("Tap target is too small" lists every small target on a screen) are left out:
  // one fix can't clear them all, so they'd loop.
  const brandId = findings.find((f) => f.agreement.who.includes('Brand check'))?.id;
  const fixable = [
    ...findings.filter((f) => f.id === brandId),
    ...findings.filter(
      (f) => (f.lane ?? 'shown') === 'shown' && /^Icon buttons|^Two controls/.test(f.title),
    ),
  ];
  await page.evaluate(
    ([projectId, ids]) =>
      (window as unknown as { fitts: { engine: { call(c: unknown): void } } }).fitts.engine.call({
        projectId,
        method: 'approveFixes',
        args: [ids],
      }),
    [project, fixable.map((f) => f.id)] as const,
  );
  const settled = async () => {
    const s = (await page.evaluate(async () => {
      const all = await (
        window as unknown as { fitts: { engine: { states(): Promise<Record<string, unknown>> } } }
      ).fitts.engine.states();
      return Object.values(all)[0];
    })) as { fixingCount: number; waitingFor?: string; changes: { status: string }[] } | undefined;
    // A request_scope question or the gate: a careful owner's answers.
    if (s?.waitingFor?.startsWith('question:'))
      await page
        .getByRole('button', { name: 'Go ahead' })
        .last()
        .click({ timeout: 5000 })
        .catch(() => undefined);
    return Boolean(s && s.fixingCount === 0 && s.changes.length > 0);
  };
  await expect.poll(settled, { timeout: 40 * 60_000, intervals: [10_000] }).toBe(true);

  const after = replay(
    readFileSync(join(runs, run, 'events.ndjson'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => (JSON.parse(l) as { event: RunEvent }).event),
  );
  const changes = after?.changes ?? [];
  const verified = changes.filter((c) => c.status === 'verified');
  console.log(
    `\nU9 fixes: ${changes.map((c) => `${c.title}: ${c.status}${c.checked ? ` (${c.checked})` : ''}${c.reason ? ` (${c.reason})` : ''}`).join(' · ')}\nSpent $${(after?.cost.spentUsd ?? 0).toFixed(4)}\n`,
  );
  // SPEC §13's U9 acceptance: at least 2 fixes checked on the Android run branch.
  expect(verified.length).toBeGreaterThanOrEqual(2);

  // A9's fix against PLANTED.md's answer key: close on color, the same font families.
  const brand = changes.find((c) => brandId && c.findingIds.includes(brandId));
  expect(brand?.status).toBe('verified');
  expect(brand?.checked).toBe('review');
  const theme = execFileSync('git', ['show', `${brand?.branch ?? ''}:src/lib/theme.ts`], {
    cwd: FOLDER,
    encoding: 'utf8',
  });
  const key = readFileSync(join(FOLDER, 'PLANTED.md'), 'utf8');
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const colorRows = [...key.matchAll(/^\| (\w+) \| (#[0-9a-f]{6}) \| #[0-9A-Fa-f]{6} \|$/gim)];
  const close = colorRows.filter(([, name, want]) => {
    const got = new RegExp(`\\b${name}: '(#[0-9a-fA-F]{6})'`).exec(theme)?.[1];
    if (!got || !want) return false;
    const [a, b] = [rgb(got.toLowerCase()), rgb(want)];
    return Math.hypot(...a.map((v, i) => v - (b[i] ?? 0))) <= 60;
  });
  console.log(`A9 colors close to the brand: ${close.length}/${colorRows.length}`);
  expect(close.length / Math.max(1, colorRows.length)).toBeGreaterThanOrEqual(0.75);
  for (const [, name, want] of key.matchAll(/^\| (\w+) \| (\w+)_\w+ \| sans-serif \|$/gm)) {
    expect(theme, `${name} uses ${want}`).toMatch(new RegExp(`\\b${name}: '${want}_`));
  }
});
