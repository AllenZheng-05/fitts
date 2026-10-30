// Records the judges' replay (SPEC-phase2 §12.3, P12): one real run of demo/chat, from the
// interview through fixes to Done, on a throwaway mirror clone (Autonomous, Economy with
// contributor pricing, dry-run PRs to a local bare origin). Its log, step shots and media are
// copied to resources/replays/demo-chat/, which the app bundles. Real calls, about $0.20. Run:
//   pnpm --filter @fitts/desktop exec playwright test -c playwright.bench.config.ts record-replay
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchApp, type LaunchedApp } from '../e2e/helpers/launch';

const MIRROR = resolve(__dirname, '../../../../.fitts-dev/mirror/fitts-demo-chat');
const OUT = resolve(__dirname, '../../resources/replays/demo-chat');
let launched: LaunchedApp | undefined;
let tmp: string | undefined;

test.afterAll(async () => {
  await launched?.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

async function state(page: Page): Promise<{ phase: string; gate?: { id: string } }> {
  return page.evaluate(async () => {
    const engine = (
      window as unknown as { fitts: { engine: { states(): Promise<Record<string, unknown>> } } }
    ).fitts.engine;
    return Object.values(await engine.states())[0] as { phase: string; gate?: { id: string } };
  });
}

test('record the demo/chat replay', async () => {
  test.setTimeout(45 * 60_000);
  tmp = mkdtempSync(join(tmpdir(), 'fitts-replay-'));
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' });
  git(tmp, 'clone', '-q', '--bare', MIRROR, 'origin.git');
  git(tmp, 'clone', '-q', join(tmp, 'origin.git'), 'demo-chat');
  const app = join(tmp, 'demo-chat');
  git(app, 'config', 'user.email', 'fitts-replay@example.com');
  git(app, 'config', 'user.name', 'Fitts replay');
  execFileSync('pnpm', ['install', '--offline', '--frozen-lockfile'], {
    cwd: app,
    stdio: 'ignore',
    shell: true,
  });

  launched = await launchApp({
    env: {
      FITTS_E2E_PICK_FOLDER: app,
      FITTS_SITE_PORT: '5198',
      FITTS_CRAWL_BRAIN: 'explorer',
      FITTS_OFFLINE: '0',
      FITTS_NO_DEV_KEYS: '0',
      FITTS_GH_DRY_RUN: '1',
    },
  });
  const { page } = launched;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const raw = localStorage.getItem('fitts.settings');
    const saved = raw
      ? (JSON.parse(raw) as { state: Record<string, unknown>; version: number })
      : { state: {}, version: 1 };
    saved.state = {
      ...saved.state,
      modelProfile: 'economy',
      contributorMode: true,
      capUsd: 3,
      defaultMode: 'autonomous',
    };
    localStorage.setItem('fitts.settings', JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Browse' }).click();
  await page.getByRole('button', { name: 'Open my project' }).click();
  await expect(page.getByLabel('Address')).toHaveValue(/localhost:5198/, { timeout: 90_000 });
  const say = async (text: string) => {
    await page.getByLabel('Message Fitts').fill(text);
    await page.getByLabel('Message Fitts').press('Enter');
  };
  await say('A messaging app so my grandparents can text the family.');
  await page.waitForTimeout(8000);
  await say('They never know if a message sent, and the buttons all say different things.');
  await page.waitForTimeout(8000);
  await say('Calm and simple.');
  await expect(page.getByRole('button', { name: 'Start the audit' })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole('button', { name: 'Start the audit' }).click();
  await expect
    .poll(
      async () => {
        const s = await state(page);
        if (s.gate) await page.getByRole('button', { name: "Don't do it" }).click();
        return s.phase;
      },
      { timeout: 40 * 60_000, intervals: [5000] },
    )
    .toBe('done');
  // Let media and the last events land, then copy the run.
  await page.waitForTimeout(20_000);
  const runs = join(launched.userData, 'projects', 'demo-chat', 'runs');
  const run = readdirSync(runs).sort().at(-1) ?? '';
  rmSync(OUT, { recursive: true, force: true });
  cpSync(join(runs, run), OUT, { recursive: true });
  console.log(`\nRecorded ${run} → ${OUT}\n`);
});
