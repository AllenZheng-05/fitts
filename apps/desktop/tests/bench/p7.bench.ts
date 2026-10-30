// P7 live checks (SPEC-phase2 §17): the real interview fills For and Who from the first answer
// on demo/chat, and theme-fit on demo/hartwell says it doesn't fit, with 3 directions. Real model
// calls (Economy with contributor pricing, a $1 cap); responses are recorded as fixtures in
// tests/fixtures/llm/p7/. Run: pnpm --filter @fitts/desktop exec playwright test -c
// playwright.bench.config.ts p7
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { launchApp, type LaunchedApp } from '../e2e/helpers/launch';

const FIXTURES = resolve(__dirname, '../fixtures/llm/p7');
let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

async function open(folder: string, port: string): Promise<Page> {
  launched = await launchApp({
    env: {
      FITTS_E2E_PICK_FOLDER: resolve(__dirname, '../../../../demo', folder),
      FITTS_SITE_PORT: port,
      FITTS_CRAWL_BRAIN: 'explorer',
      FITTS_OFFLINE: '0',
      FITTS_NO_DEV_KEYS: '0',
      FITTS_RECORD_LLM: FIXTURES,
    },
  });
  const { page } = launched;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const raw = localStorage.getItem('fitts.settings');
    const saved = raw
      ? (JSON.parse(raw) as { state: Record<string, unknown>; version: number })
      : { state: {}, version: 1 };
    saved.state = { ...saved.state, modelProfile: 'economy', contributorMode: true, capUsd: 1 };
    localStorage.setItem('fitts.settings', JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Browse' }).click();
  await page.getByRole('button', { name: 'Open my project' }).click();
  await expect(page.getByLabel('Address')).toHaveValue(new RegExp(`localhost:${port}`), {
    timeout: 60_000,
  });
  return page;
}

async function state(page: Page) {
  return page.evaluate(async () => {
    const engine = (
      window as unknown as { fitts: { engine: { states(): Promise<Record<string, unknown>> } } }
    ).fitts.engine;
    const all = await engine.states();
    return Object.values(all)[0] as {
      brief: Record<string, string | undefined>;
      chat: { type: string; text?: string; options?: unknown[] }[];
    };
  });
}

async function answer(page: Page, text: string) {
  await page.getByLabel('Message Fitts').fill(text);
  await page.getByLabel('Message Fitts').press('Enter');
}

test('the real interview fills For and Who from the first answer (demo/chat)', async () => {
  test.setTimeout(5 * 60_000);
  const page = await open('chat', '5193');
  await answer(page, 'A messaging app so my grandparents can text the family.');
  await expect
    .poll(async () => (await state(page)).brief, { timeout: 90_000 })
    .toMatchObject({ for: expect.any(String), who: expect.any(String) });
  const s = await state(page);
  console.log(
    `\nBrief: ${JSON.stringify(s.brief)}\nFitts: ${s.chat.filter((c) => c.type === 'fitts.message').at(-1)?.text ?? ''}\n`,
  );
  // Summaries in Fitts's words, not the raw answer.
  expect(s.brief['for']).not.toBe('A messaging app so my grandparents can text the family.');
  await expect(page.getByRole('button', { name: 'Start the audit' })).toBeVisible();
});

test('theme-fit on demo/hartwell: it doesn’t fit, with 3 directions', async () => {
  test.setTimeout(10 * 60_000);
  const page = await open('hartwell', '5194');
  await answer(
    page,
    'A funeral home website for families who just lost someone. It should feel calm and respectful.',
  );
  await expect(page.getByRole('button', { name: 'Start the audit' })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole('button', { name: 'Start the audit' }).click();
  await expect
    .poll(async () => (await state(page)).chat.some((c) => c.type === 'directions'), {
      timeout: 6 * 60_000,
      intervals: [3000],
    })
    .toBe(true);
  const s = await state(page);
  const lookfeel = s.chat.find((c) => c.type === 'lookfeel');
  const directions = s.chat.find((c) => c.type === 'directions');
  console.log(
    `\nLook and feel: ${lookfeel?.text ?? ''}\nDirections: ${JSON.stringify(directions?.options)}\n`,
  );
  expect(lookfeel?.text).toBeTruthy();
  expect(directions?.options).toHaveLength(3);
});
