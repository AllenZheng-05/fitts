// `pnpm bench:chat` (SPEC-phase2 §3.1, §17 P6): one real audit of demo/chat, scored against
// PLANTED.md. It spends money: the reviewer panel makes real model calls with the developer's
// keys (dev builds read .env.local in main), on Economy with contributor pricing and a $2 cap.
// The crawl uses the deterministic explorer. BENCH_OFFLINE=1 scores the probes alone, for free.
import { expect, test } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { replay, type RunEvent } from '@fitts/schema';
import { launchApp, type LaunchedApp } from '../e2e/helpers/launch';
import { report, score } from './planted';

const DEMO = resolve(__dirname, '../../../../demo/chat');
const PORT = '5192';
const OFFLINE = process.env['BENCH_OFFLINE'] === '1';

let launched: LaunchedApp | undefined;

test.afterAll(async () => {
  await launched?.close({ keepUserData: true });
});

test('bench:chat', async () => {
  test.setTimeout(30 * 60_000);
  launched = await launchApp({
    env: {
      FITTS_E2E_PICK_FOLDER: DEMO,
      FITTS_SITE_PORT: PORT,
      FITTS_CRAWL_BRAIN: 'explorer',
      FITTS_OFFLINE: OFFLINE ? '1' : '0',
      FITTS_NO_DEV_KEYS: OFFLINE ? '1' : '0',
    },
  });
  const { page } = launched;
  await page.setViewportSize({ width: 1440, height: 900 });

  // Economy (5× Spark), contributor pricing on demo projects, a $2 cap.
  await page.evaluate(() => {
    const raw = localStorage.getItem('fitts.settings');
    const saved = raw
      ? (JSON.parse(raw) as { state: Record<string, unknown>; version: number })
      : { state: {}, version: 1 };
    saved.state = { ...saved.state, modelProfile: 'economy', contributorMode: true, capUsd: 2 };
    localStorage.setItem('fitts.settings', JSON.stringify(saved));
  });
  await page.reload();

  if (OFFLINE) await page.getByLabel('Meta Model API key').fill('meta-key-12345');
  await page.getByRole('button', { name: 'Browse' }).click();
  await expect(page.getByText(/Vite \+ React 19/)).toBeVisible();
  await page.getByRole('button', { name: 'Open my project' }).click();
  await expect(page.getByLabel('Address')).toHaveValue(`localhost:${PORT}/compose`, {
    timeout: 60_000,
  });
  await page
    .getByLabel('Message Fitts')
    .fill(
      'A messaging app so my grandparents can text the family. It should feel calm and simple.',
    );
  await page.getByLabel('Message Fitts').press('Enter');
  await page.getByRole('button', { name: 'Start the audit' }).click();

  // Done when the run ends (findings) or says it found nothing.
  await expect
    .poll(
      async () => {
        const s = (await page.evaluate(async () => {
          const engine = (
            window as unknown as {
              fitts: { engine: { states(): Promise<Record<string, unknown>> } };
            }
          ).fitts.engine;
          return (await engine.states())['demo-chat'];
        })) as { phase: string; chat: { stateKind?: string }[] } | undefined;
        return s?.phase === 'done' || Boolean(s?.chat.some((c) => c.stateKind === 'nothing-found'));
      },
      { timeout: 25 * 60_000, intervals: [5000] },
    )
    .toBe(true);

  // Score the run from its log, the same events the UI reduced.
  const runs = join(launched.userData, 'projects', 'demo-chat', 'runs');
  const run = readdirSync(runs).sort().at(-1) ?? '';
  const events = readFileSync(join(runs, run, 'events.ndjson'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => (JSON.parse(l) as { event: RunEvent }).event);
  const state = replay(events);
  const findings = state?.findings ?? [];
  const s = score(findings);
  const text = report(s);
  const spent = state?.cost.spentUsd ?? 0;
  console.log(
    `\n${text}\nSpent $${spent.toFixed(4)} (${OFFLINE ? 'offline: probes only' : 'real reviewer calls'})\n`,
  );

  // Keep the findings for tuning, next to the dev spend log (gitignored).
  const out = resolve(__dirname, '../../../../.fitts-dev/bench');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, `chat-${OFFLINE ? 'offline' : 'live'}.json`),
    JSON.stringify({ at: new Date().toISOString(), spent, recall: s.recall, findings }, null, 2),
  );

  if (!OFFLINE) {
    expect(s.recall).toBeGreaterThanOrEqual(0.8);
    expect(s.falsePositives.length).toBeLessThanOrEqual(2);
  }
});
