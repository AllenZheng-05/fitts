// The website's hero picture (apps/site/public/media/app.png): Fitts mid-run, from the bundled
// recorded run, so it needs no keys and spends nothing.
import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { launchApp, type LaunchedApp } from '../e2e/helpers/launch';

let launched: LaunchedApp | undefined;

test.afterAll(async () => {
  await launched?.close();
});

test('site shot', async () => {
  test.setTimeout(180_000);
  launched = await launchApp({ env: { FITTS_OFFLINE: '1', FITTS_NO_DEV_KEYS: '1' } });
  const { page } = launched;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Watch a recorded run' }).click();
  // Wait until findings are in the tray and the chat, mid-audit.
  await expect(page.getByText(/Findings · [1-9]\d* so far/)).toBeVisible({ timeout: 150_000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: resolve(__dirname, '../../../site/public/media/app.png') });
});
