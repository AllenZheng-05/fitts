// Phase 2 P3: the 80% and 100% budget cards fire from the agent's budget guard ($0.10 cap).
import { expect, test } from '@playwright/test';
import { completeSetup } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async () => {
  await launched.close();
});

test('with a $0.10 cap, the 80% card warns and the 100% card pauses the run', async () => {
  test.setTimeout(90_000);
  const { page } = launched;
  await completeSetup(page);
  await page.keyboard.press('ControlOrMeta+,');
  const cap = page.getByLabel('Spending limit per run (optional)');
  await cap.fill('0.10');
  await cap.blur();
  await page.getByRole('button', { name: 'Back to workspace' }).click();

  await page
    .getByLabel('Message Fitts')
    .fill('A messaging app so my grandparents can text the family.');
  await page.getByLabel('Message Fitts').press('Enter');
  await page.getByRole('button', { name: 'Start the audit' }).click();

  const chat = page.getByRole('log', { name: 'Conversation with Fitts' });
  await expect(chat).toContainText("I've used 80% of your $0.10 cap", { timeout: 40_000 });
  await expect(chat).toContainText("I've reached your $0.10 cap", { timeout: 40_000 });
  const status = page.getByRole('region', { name: 'Fitts' }).getByRole('status').first();
  await expect(status).toHaveText('Waiting on you');
  // The header chip shows spend against the cap.
  await expect(page.getByText(/\/ \$0\.10/)).toBeVisible();
});
