// P10 live check (SPEC-phase2 §17): the Finding panel shows a SAM outline and a real Muse Image
// mockup; hartwell's redesign directions get Muse Image mockups. Real calls (SAM about $0.0025
// an image, Muse Image $0.01). Screenshots for review go to .fitts-dev/bench/. Run:
//   pnpm --filter @fitts/desktop exec playwright test -c playwright.bench.config.ts p10
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchApp, type LaunchedApp } from '../e2e/helpers/launch';

const OUT = resolve(__dirname, '../../../../.fitts-dev/bench');
const MIRROR = resolve(__dirname, '../../../../.fitts-dev/mirror/fitts-demo-chat');
let launched: LaunchedApp | undefined;
let tmp: string | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

/** A throwaway clone of the demo/chat mirror: fixes are available, so in Ask when unsure the
 *  run waits at the approval card and the audit screen (with the Finding panel) stays up. */
function mirrorClone(): string {
  tmp = mkdtempSync(join(tmpdir(), 'fitts-p10-'));
  execFileSync('git', ['clone', '-q', MIRROR, 'demo-chat'], { cwd: tmp });
  const app = join(tmp, 'demo-chat');
  execFileSync('pnpm', ['install', '--offline', '--frozen-lockfile'], {
    cwd: app,
    stdio: 'ignore',
    shell: true,
  });
  return app;
}

interface Run {
  phase: string;
  gate?: { id: string };
  findings: { id: string; title: string; lane?: string; assets?: Record<string, string> }[];
  chat: { type: string; stateKind?: string; options?: { name: string; mockup?: string }[] }[];
}

async function state(page: Page): Promise<Run> {
  return page.evaluate(async () => {
    const engine = (
      window as unknown as { fitts: { engine: { states(): Promise<Record<string, unknown>> } } }
    ).fitts.engine;
    return Object.values(await engine.states())[0] as Run;
  });
}

async function open(folder: string, port: string, answer: string): Promise<Page> {
  launched = await launchApp({
    env: {
      FITTS_E2E_PICK_FOLDER: folder,
      FITTS_SITE_PORT: port,
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
  await page.getByRole('button', { name: 'Open my project' }).click();
  await expect(page.getByLabel('Address')).toHaveValue(new RegExp(`localhost:${port}`), {
    timeout: 90_000,
  });
  await page.getByLabel('Message Fitts').fill(answer);
  await page.getByLabel('Message Fitts').press('Enter');
  await expect(page.getByRole('button', { name: 'Start the audit' })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole('button', { name: 'Start the audit' }).click();
  return page;
}

test('SAM outline and a real mockup in the Finding panel (demo/chat)', async () => {
  test.setTimeout(30 * 60_000);
  const page = await open(
    mirrorClone(),
    '5196',
    'A messaging app so my grandparents can text the family.',
  );
  await expect
    .poll(
      async () => {
        const s = await state(page);
        if (s.gate) await page.getByRole('button', { name: "Don't do it" }).click();
        return s.findings.some((f) => f.assets?.mask) && s.findings.some((f) => f.assets?.mockup);
      },
      { timeout: 25 * 60_000, intervals: [5000] },
    )
    .toBe(true);
  const s = await state(page);
  const outlined = s.findings.filter((f) => f.assets?.mask);
  const mocked = s.findings.filter((f) => f.assets?.mockup);
  console.log(
    `\nOutlined: ${outlined.map((f) => f.title).join(' | ')}\nMockups: ${mocked.map((f) => f.title).join(' | ')}\n`,
  );

  // Open a finding that has both, from its chat card, in the real Finding panel.
  const both = s.findings.find((f) => f.assets?.mask && f.assets.mockup) ?? mocked[0];
  const card = page
    .getByRole('log', { name: 'Conversation with Fitts' })
    .locator('div', { has: page.getByText(both?.title ?? '', { exact: true }) })
    .last();
  await card.getByRole('button', { name: 'See evidence and fix' }).click();
  const panel = page.getByRole('dialog').filter({ hasText: both?.title ?? '' });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByAltText('The page when Fitts found this, with the element outlined'),
  ).toBeVisible();
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, 'p10-finding-outline.png') });
  await panel.getByRole('tab', { name: 'Mockup' }).click();
  await expect(panel.getByText('Mockup · not code')).toBeVisible();
  await expect
    .poll(() =>
      panel
        .locator('img[alt^="A generated picture"]')
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(300);
  await page.screenshot({ path: join(OUT, 'p10-finding-mockup.png') });
});

test('hartwell’s redesign directions get Muse Image mockups', async () => {
  test.setTimeout(15 * 60_000);
  const page = await open(
    resolve(__dirname, '../../../../demo/hartwell'),
    '5197',
    'A funeral home website for families who just lost someone. It should feel calm and respectful.',
  );
  await expect
    .poll(
      async () => {
        const d = (await state(page)).chat.find((c) => c.type === 'directions');
        return d?.options?.filter((o) => o.mockup).length ?? 0;
      },
      { timeout: 10 * 60_000, intervals: [5000] },
    )
    .toBe(3);
  const d = (await state(page)).chat.find((c) => c.type === 'directions');
  console.log(`\nDirections: ${JSON.stringify(d?.options?.map((o) => [o.name, o.mockup]))}\n`);
  const card = page.getByRole('group', { name: 'Design directions' });
  await expect(card.locator('img')).toHaveCount(3);
  mkdirSync(OUT, { recursive: true });
  await card.screenshot({ path: join(OUT, 'p10-directions.png') });
});
