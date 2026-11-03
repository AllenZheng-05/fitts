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
  const started = Date.now();
  test.setTimeout(30 * 60_000);
  launched = await launchApp({
    env: {
      FITTS_E2E_PICK_FOLDER: DEMO,
      FITTS_SITE_PORT: PORT,
      FITTS_CRAWL_BRAIN: 'explorer',
      // The answer key is the bench's, never Fitts's to read.
      FITTS_HIDE_FILES: 'PLANTED.md',
      FITTS_OFFLINE: OFFLINE ? '1' : '0',
      FITTS_NO_DEV_KEYS: OFFLINE ? '1' : '0',
      // The baseline comparison's ablation arm (docs/bench/PLAN.md): BENCH_JUDGE=0.
      FITTS_JUDGE: process.env['BENCH_JUDGE'] ?? '1',
    },
  });
  const { page } = launched;
  await page.setViewportSize({ width: 1440, height: 900 });

  // Economy (5× Spark) unless BENCH_PROFILE says quality or open; contributor pricing on demo
  // projects; a $2 cap.
  const profile = process.env['BENCH_PROFILE'] ?? 'economy';
  await page.evaluate((profile) => {
    const raw = localStorage.getItem('fitts.settings');
    const saved = raw
      ? (JSON.parse(raw) as { state: Record<string, unknown>; version: number })
      : { state: {}, version: 1 };
    saved.state = { ...saved.state, modelProfile: profile, contributorMode: true, capUsd: 2 };
    localStorage.setItem('fitts.settings', JSON.stringify(saved));
  }, profile);
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
  // The real interview's first reply (and the App Model's Pass 2) can take a while.
  await page.getByRole('button', { name: 'Start the audit' }).click({ timeout: 120_000 });

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
        })) as
          | { phase: string; waitingFor?: string; chat: { stateKind?: string; answer?: string }[] }
          | undefined;
        // The demo's dev server stopped: fail now with the reason, not at the timeout.
        if (s?.chat.some((c) => c.stateKind === 'site-down' && c.answer === undefined))
          throw new Error('demo/chat stopped answering (the site-down card is up)');
        // A destructive write held at the gate (demo/chat's Delete conversation): answer it as a
        // careful owner would, or the run waits on the modal until the bench times out.
        if (s?.waitingFor === 'gate')
          await page
            .getByRole('alertdialog', { name: 'This could delete real data' })
            .getByRole('button', { name: "Don't do it" })
            .click({ timeout: 5000 })
            .catch(() => undefined);
        // Findings are in once the run ends, finds nothing, or asks to fix what it found (the
        // test build fixes demo/chat in its mirror repo, so the approval card comes first).
        return (
          s?.phase === 'done' ||
          s?.waitingFor === 'approval' ||
          s?.waitingFor === 'finish-proposal' ||
          Boolean(s?.chat.some((c) => c.stateKind === 'nothing-found'))
        );
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

  // The baseline table's line (docs/bench/PLAN.md): strata, precision, cost, wall.
  const S1 = new Set([1, 7, 8, 9, 10, 11, 12, 17, 19, 20, 23, 24, 26, 27, 28, 29, 31, 32, 33]);
  const m1 = s.matched.filter((m) => S1.has(m.planted.n)).length;
  const shown = findings.filter((f) => f.lane !== 'suggestion');
  const sev2 = shown.filter((f) => f.severity >= 2);
  const hit = new Set(s.matched.map((m) => m.finding.id));
  console.log(
    `BENCH-CHAT profile=${process.env['BENCH_PROFILE'] ?? 'default'} judge=${process.env['BENCH_JUDGE'] ?? '1'} at=${new Date().toISOString()} recall=${s.matched.length}/33 S1=${m1}/19 S2=${s.matched.length - m1}/14 shown=${shown.length} precisionStrict=${(shown.filter((f) => hit.has(f.id)).length / Math.max(1, shown.length)).toFixed(3)} precisionSev2=${(sev2.filter((f) => hit.has(f.id)).length / Math.max(1, sev2.length)).toFixed(3)} unplannedSev2=${s.falsePositives.length} cost=${spent.toFixed(4)} wall=${Math.round((Date.now() - started) / 1000)}s`,
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
