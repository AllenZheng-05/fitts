// Phase 2 P2: the real demo/chat streams into the workspace from an offscreen window.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { launchApp, type LaunchedApp } from './helpers/launch';

const DEMO = resolve(__dirname, '../../../../demo/chat');
const PORT = '5191';
let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp({ env: { FITTS_E2E_PICK_FOLDER: DEMO, FITTS_SITE_PORT: PORT } });
  await launched.page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async () => {
  await launched.close();
});

const canvas = (page: Page) => page.locator('[data-site-canvas] canvas');
const address = (page: Page) => page.getByLabel('Address');

/** The element's box in the live site, through the same bridge the overlays use. */
async function siteRect(page: Page, ref: string) {
  return page.evaluate(
    async ([id, r]) => {
      const site = (
        window as unknown as {
          fitts: {
            site: {
              rects(
                p: string,
                refs: string[],
              ): Promise<
                Record<string, { left: number; top: number; width: number; height: number }>
              >;
            };
          };
        }
      ).fitts.site;
      return (await site.rects(id, [r]))[r] ?? null;
    },
    ['demo-chat', ref] as const,
  );
}

/** Clicks a site element through the canvas, the way a user does while driving. */
async function clickInSite(page: Page, ref: string) {
  const rect = await siteRect(page, ref);
  if (!rect) throw new Error(`no ${ref} in the site`);
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + rect.left + rect.width / 2, box.y + rect.top + rect.height / 2);
}

test('demo/chat streams live, the user drives it in the interview, and point returns a ref', async () => {
  test.setTimeout(120_000);
  const { page } = launched;
  await page.getByLabel('Meta Model API key').fill('meta-key-12345');
  await expect(page.getByRole('status').filter({ hasText: 'Works' })).toBeVisible();
  await page.getByRole('button', { name: 'Browse' }).click();
  await expect(page.getByText(/Vite \+ React 19/)).toBeVisible();
  await page.getByRole('button', { name: 'Open my project' }).click();

  // The real site, at its start path, painted onto the canvas.
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose`, { timeout: 60_000 });
  await expect
    .poll(() => canvas(page).evaluate((c: HTMLCanvasElement) => c.width), { timeout: 30_000 })
    .toBeGreaterThan(300);

  // The user drives during the interview: pick Grandma, then NEXT.
  await expect.poll(() => siteRect(page, 'compose-contact-grandma')).not.toBeNull();
  await clickInSite(page, 'compose-contact-grandma');
  await clickInSite(page, 'compose-next-1');
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose/recipient`);

  // Point at something: a click on the canvas attaches the real element's ref.
  await page.getByRole('button', { name: 'Point at something' }).click();
  const to = await siteRect(page, 'compose-to');
  const box = await canvas(page).boundingBox();
  if (!to || !box) throw new Error('no To field');
  await page.mouse.move(box.x + to.left + 10, box.y + to.top + to.height / 2);
  await page.mouse.click(box.x + to.left + 10, box.y + to.top + to.height / 2);
  await expect(page.getByText('pointing at #compose-to')).toBeVisible();
});

test('overlays line up with the real elements during the audit', async () => {
  test.setTimeout(120_000);
  const { page } = launched;
  await page.getByLabel('Meta Model API key').fill('meta-key-12345');
  await page.getByRole('button', { name: 'Browse' }).click();
  await expect(page.getByText(/Vite \+ React 19/)).toBeVisible();
  await page.getByRole('button', { name: 'Open my project' }).click();
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose`, { timeout: 60_000 });
  await page
    .getByLabel('Message Fitts')
    .fill('A messaging app so my grandparents can text the family.');
  await page.getByLabel('Message Fitts').press('Enter');
  await page.getByRole('button', { name: 'Start the audit' }).click();

  // The scripted run flags the "(null)" To field; its outline sits on the real element.
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose/recipient`, {
    timeout: 40_000,
  });
  const pin = page.getByRole('region', { name: 'Your site' }).getByText('1', { exact: true });
  await expect(pin.first()).toBeVisible({ timeout: 40_000 });
  const to = await siteRect(page, 'compose-to');
  const box = await canvas(page).boundingBox();
  const pinBox = await pin.first().boundingBox();
  if (!to || !box || !pinBox) throw new Error('missing boxes');
  // The pin sits at the outline's top-right corner (6px outset).
  expect(Math.abs(pinBox.x + pinBox.width / 2 - (box.x + to.left + to.width + 6))).toBeLessThan(16);
  expect(Math.abs(pinBox.y + pinBox.height / 2 - (box.y + to.top - 6))).toBeLessThan(16);
});

test('take the wheel on the live site logs clicks by name, and rewind shows a stored step shot', async () => {
  test.setTimeout(120_000);
  const { page } = launched;
  await page.getByLabel('Meta Model API key').fill('meta-key-12345');
  await page.getByRole('button', { name: 'Browse' }).click();
  await expect(page.getByText(/Vite \+ React 19/)).toBeVisible();
  await page.getByRole('button', { name: 'Open my project' }).click();
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose`, { timeout: 60_000 });
  await page
    .getByLabel('Message Fitts')
    .fill('A messaging app so my grandparents can text the family.');
  await page.getByLabel('Message Fitts').press('Enter');
  await page.getByRole('button', { name: 'Start the audit' }).click();
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose/recipient`, {
    timeout: 40_000,
  });

  const controls = page.getByRole('group', { name: 'Run controls' });
  await controls.getByRole('button', { name: 'Take the wheel' }).click();
  await expect.poll(() => siteRect(page, 'compose-create')).not.toBeNull();
  await clickInSite(page, 'compose-create');
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose/confirm`);
  await controls.getByRole('button', { name: 'Hand back to Fitts' }).click();
  await expect(page.getByRole('log', { name: 'Conversation with Fitts' })).toContainText(
    'Create Message',
  );

  // Rewind to the first finding: the stored shot of that step replaces the live canvas.
  const dot = page.getByRole('button', { name: /^Rewind to/ }).first();
  await expect(dot).toBeVisible({ timeout: 40_000 });
  await dot.click();
  const shot = page.locator('img[src^="fitts-asset://"]');
  await expect(shot).toBeVisible();
  await expect
    .poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(300);
});
