// P9 live check (SPEC-phase2 §17): real fixes on a throwaway clone of the demo/chat mirror, with
// a local bare `origin` and FITTS_GH_DRY_RUN (pushes go to the bare repo; nothing reaches
// GitHub). Autonomous opens PRs without asking; the 2nd fix job is sabotaged so it rolls back,
// then it's retried; undo closes a PR; undo of a merged PR opens a revert PR. Real model calls
// (Economy with contributor pricing, a $3 cap). Run:
//   pnpm --filter @fitts/desktop exec playwright test -c playwright.bench.config.ts p9
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchApp, type LaunchedApp } from '../e2e/helpers/launch';

const MIRROR = resolve(__dirname, '../../../../.fitts-dev/mirror/fitts-demo-chat');
const PORT = '5195';
let launched: LaunchedApp | undefined;
let tmp: string | undefined;

test.afterAll(async () => {
  await launched?.close();
  // The throwaway clone (BENCH_KEEP=1 keeps it to inspect the branches).
  if (tmp && process.env['BENCH_KEEP'] !== '1') rmSync(tmp, { recursive: true, force: true });
});

interface Run {
  phase: string;
  gate?: { id: string };
  findings: { id: string; title: string; status: string; prNumber?: number }[];
  changes: {
    id: string;
    title: string;
    status: string;
    prNumber?: number;
    reason?: string;
    branch?: string;
  }[];
}

async function state(page: Page): Promise<Run> {
  return page.evaluate(async () => {
    const engine = (
      window as unknown as { fitts: { engine: { states(): Promise<Record<string, unknown>> } } }
    ).fitts.engine;
    return Object.values(await engine.states())[0] as Run;
  });
}

async function call(page: Page, method: string, args: unknown[]) {
  await page.evaluate(
    ([m, a]) => {
      const engine = (window as unknown as { fitts: { engine: { call(c: unknown): void } } }).fitts
        .engine;
      engine.call({ projectId: 'demo-chat', method: m, args: a });
    },
    [method, args] as const,
  );
}

test('real fixes: ≥5 verified PRs, a rollback then retry, undo and a revert PR', async () => {
  test.setTimeout(45 * 60_000);
  // A throwaway clone whose origin is a local bare repo.
  tmp = mkdtempSync(join(tmpdir(), 'fitts-p9-'));
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' });
  git(tmp, 'clone', '-q', '--bare', MIRROR, 'origin.git');
  git(tmp, 'clone', '-q', join(tmp, 'origin.git'), 'demo-chat');
  const app = join(tmp, 'demo-chat');
  git(app, 'config', 'user.email', 'fitts-bench@example.com');
  git(app, 'config', 'user.name', 'Fitts bench');
  execFileSync('pnpm', ['install', '--offline', '--frozen-lockfile'], {
    cwd: app,
    stdio: 'ignore',
    shell: true,
  });
  console.log(`\nProject: ${app}`);

  launched = await launchApp({
    env: {
      FITTS_E2E_PICK_FOLDER: app,
      FITTS_SITE_PORT: PORT,
      FITTS_CRAWL_BRAIN: 'explorer',
      FITTS_OFFLINE: '0',
      FITTS_NO_DEV_KEYS: '0',
      FITTS_GH_DRY_RUN: '1',
      FITTS_SABOTAGE_FIX: '2',
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
  await expect(page.getByLabel('Address')).toHaveValue(new RegExp(`localhost:${PORT}`), {
    timeout: 90_000,
  });
  await page
    .getByLabel('Message Fitts')
    .fill('A messaging app so my grandparents can text the family.');
  await page.getByLabel('Message Fitts').press('Enter');
  await expect(page.getByRole('button', { name: 'Start the audit' })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole('button', { name: 'Start the audit' }).click();
  await call(page, 'setMode', ['autonomous']);

  // The gate still asks about "Delete conversation" in Autonomous: say no.
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

  let s = await state(page);
  const verified = s.changes.filter((c) => c.status === 'verified' && c.prNumber !== undefined);
  const rolled = s.changes.filter((c) => c.status === 'rolled-back');
  console.log(
    `\nChanges:\n${s.changes.map((c) => `  [${c.status}] ${c.title}${c.prNumber ? ` · PR #${c.prNumber}` : ''}${c.reason ? ` · ${c.reason}` : ''}`).join('\n')}\n`,
  );
  expect(verified.length).toBeGreaterThanOrEqual(5);
  const sabotaged = rolled.find((c) => c.reason?.includes('deliberately skipped'));
  expect(sabotaged).toBeTruthy();

  // Retry the rolled-back one: it verifies with a new PR.
  await call(page, 'retryChange', [sabotaged?.id]);
  await expect
    .poll(async () => (await state(page)).changes.find((c) => c.id === sabotaged?.id)?.status, {
      timeout: 10 * 60_000,
      intervals: [3000],
    })
    .toMatch(/verified|rolled-back/);
  s = await state(page);
  const retried = s.changes.find((c) => c.id === sabotaged?.id);
  console.log(
    `Retried: [${retried?.status}] ${retried?.title}${retried?.prNumber ? ` · PR #${retried.prNumber}` : ''}${retried?.reason ? ` · ${retried.reason}` : ''}`,
  );
  expect(retried?.status).toBe('verified');
  expect(retried?.prNumber).toBeDefined();

  // Undo of an open PR closes it.
  const first = verified[0];
  await call(page, 'undoChange', [first?.id]);
  await expect
    .poll(async () => (await state(page)).changes.find((c) => c.id === first?.id)?.status)
    .toBe('undone');
  const registry = join(app, '.fitts-worktrees', 'dry-run-prs.json');
  const prs = () =>
    JSON.parse(readFileSync(registry, 'utf8')) as {
      prs: { number: number; state: string; branch: string }[];
    };
  expect(prs().prs.find((p) => p.number === first?.prNumber)?.state).toBe('closed');

  // A merged PR's undo opens a revert PR.
  const second = verified[1];
  const data = prs();
  const merged = data.prs.find((p) => p.number === second?.prNumber);
  if (merged) merged.state = 'merged';
  writeFileSync(registry, JSON.stringify(data));
  const before = data.prs.length;
  await call(page, 'undoChange', [second?.id]);
  await expect.poll(() => prs().prs.length, { timeout: 60_000 }).toBe(before + 1);
  expect(prs().prs.at(-1)?.branch).toMatch(/^fitts\/revert-/);
  expect(existsSync(join(tmp, 'origin.git'))).toBe(true);
  console.log(
    `Dry-run PRs: ${JSON.stringify(prs().prs.map((p) => `#${p.number} ${p.state} ${p.branch}`))}`,
  );
});
