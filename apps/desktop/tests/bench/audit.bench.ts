// `pnpm bench:audit`: one real audit-only run of any local project, for sizing up a demo target.
// BENCH_FOLDER is the project, BENCH_BRIEF the first interview answer. It changes no code: it
// keeps the current look if theme-fit offers directions, and stops at the fix approval card.
// It spends money (Economy, contributor pricing, a $2 cap) with the developer's .env.local keys.
import { expect, test } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { replay, type RunEvent, type RunState } from '@fitts/schema';
import { launchApp, type LaunchedApp } from '../e2e/helpers/launch';

const FOLDER = process.env['BENCH_FOLDER'] ?? '';
const BRIEF = process.env['BENCH_BRIEF'] ?? '';
const PORT = process.env['BENCH_PORT'] ?? '5193';

let launched: LaunchedApp | undefined;

test.afterAll(async () => {
  await launched?.close({ keepUserData: true });
});

test('bench:audit', async () => {
  test.skip(!FOLDER || !BRIEF, 'set BENCH_FOLDER and BENCH_BRIEF');
  test.setTimeout(30 * 60_000);
  launched = await launchApp({
    env: {
      FITTS_E2E_PICK_FOLDER: FOLDER,
      FITTS_SITE_PORT: PORT,
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
  // Main's real detection (its framework line) before opening, never a Phase 1 fixture.
  const pkg = JSON.parse(readFileSync(join(FOLDER, 'package.json'), 'utf8')) as { name?: string };
  await expect(page.getByText(pkg.name ?? basename(FOLDER)).first()).toBeVisible();
  await page.getByRole('button', { name: 'Open my project' }).click();
  await expect(page.getByLabel('Address')).toHaveValue(new RegExp(`localhost:${PORT}`), {
    timeout: 120_000,
  });
  await page.getByLabel('Message Fitts').fill(BRIEF);
  await page.getByLabel('Message Fitts').press('Enter');
  await page.getByRole('button', { name: 'Start the audit' }).click();

  const states = () =>
    page.evaluate(async () => {
      const engine = (
        window as unknown as { fitts: { engine: { states(): Promise<Record<string, unknown>> } } }
      ).fitts.engine;
      return (await engine.states()) as Record<string, RunState>;
    });
  // Audit only: keep the look if asked, and stop at the approval card (or when it ends).
  await expect
    .poll(
      async () => {
        const all = await states();
        const [projectId, s] = Object.entries(all).find(([, r]) => r.phase !== 'interview') ?? [];
        if (!projectId || !s) return false;
        const pick = s.chat.find(
          (c) =>
            c.type === 'question' && c.answer === undefined && c.options.includes('Keep my look'),
        );
        if (pick)
          await page.evaluate(
            ([p, id]) =>
              (
                window as unknown as {
                  fitts: {
                    engine: {
                      call(c: { projectId: string; method: string; args: unknown[] }): void;
                    };
                  };
                }
              ).fitts.engine.call({
                projectId: p ?? '',
                method: 'answerQuestion',
                args: [id, 'Keep my look'],
              }),
            [projectId, pick.id],
          );
        return (
          s.phase === 'done' ||
          s.waitingFor === 'approval' ||
          s.chat.some((c) => c.type === 'state' && c.stateKind === 'nothing-found')
        );
      },
      { timeout: 25 * 60_000, intervals: [5000] },
    )
    .toBe(true);

  const root = join(launched.userData, 'projects');
  const projectId = readdirSync(root).find((p) => existsRuns(join(root, p))) ?? '';
  const runs = join(root, projectId, 'runs');
  const run = readdirSync(runs).sort().at(-1) ?? '';
  const events = readFileSync(join(runs, run, 'events.ndjson'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => (JSON.parse(l) as { event: RunEvent }).event);
  const state = replay(events);
  const findings = state?.findings ?? [];
  const lookfeel = state?.chat.find((c) => c.type === 'lookfeel');
  const lines = findings
    .sort((a, b) => b.severity - a.severity)
    .map(
      (f) =>
        `  ${f.lane === 'suggestion' ? '(suggestion) ' : ''}sev ${f.severity} ${f.heuristic ?? f.lens} ${f.route} · ${f.title}`,
    );
  console.log(
    [
      '',
      `${basename(FOLDER)}: ${findings.filter((f) => f.lane !== 'suggestion').length} shown findings, ${findings.filter((f) => f.lane === 'suggestion').length} suggestions, ${state?.routes.length ?? 0} pages`,
      ...lines,
      `Theme-fit: ${lookfeel?.type === 'lookfeel' ? `doesn't fit: ${lookfeel.text}` : 'fits (no directions)'}`,
      `Spent $${(state?.cost.spentUsd ?? 0).toFixed(4)}`,
      '',
    ].join('\n'),
  );
  const out = resolve(__dirname, '../../../../.fitts-dev/bench');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, `audit-${basename(FOLDER)}.json`),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        spent: state?.cost.spentUsd,
        routes: state?.routes,
        lookfeel,
        findings,
      },
      null,
      2,
    ),
  );
});

function existsRuns(dir: string): boolean {
  try {
    return readdirSync(join(dir, 'runs')).length > 0;
  } catch {
    return false;
  }
}
