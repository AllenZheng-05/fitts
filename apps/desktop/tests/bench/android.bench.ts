// `pnpm bench:android` (SPEC-phase4 §9.1): one real audit of Basil & Ember's ordering app on the
// emulator, scored against demo/basil-ember-android/PLANTED.md (A1–A9). It spends money (the
// reviewer panel and the brand check, on Economy with contributor pricing and a $2 cap) and needs
// the app's development build installed on a running emulator, from a short path (NEEDS-ALLEN
// P4-0a/b). The project folder is BENCH_ANDROID_FOLDER, else C:/Users/Plasm/bea.
import { expect, test } from '@playwright/test';
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
  await page.evaluate(() => {
    const raw = localStorage.getItem('fitts.settings');
    const saved = raw
      ? (JSON.parse(raw) as { state: Record<string, unknown>; version: number })
      : { state: {}, version: 1 };
    saved.state = { ...saved.state, modelProfile: 'economy', contributorMode: true, capUsd: 2 };
    localStorage.setItem('fitts.settings', JSON.stringify(saved));
  });
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
  // U8's acceptance: at least 6 of the planted issues (A1–A9 now; SPEC §13 said 6 of 8).
  expect(s.matched.length).toBeGreaterThanOrEqual(6);
});
