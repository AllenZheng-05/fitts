import { expect, type Page } from '@playwright/test';

/** First-launch setup on Welcome: key, folder (via the e2e folder picker), mode, open. */
export async function completeSetup(
  page: Page,
  mode: 'plan' | 'ask-every' | 'ask-unsure' | 'autonomous' = 'ask-unsure',
) {
  await expect(page.getByRole('heading', { name: "Hi, I'm Fitts." })).toBeVisible();
  await page.getByLabel('Meta Model API key').fill('meta-key-12345');
  await expect(page.getByRole('status').filter({ hasText: 'Works' })).toBeVisible();
  await page.getByRole('button', { name: 'Browse' }).click();
  await expect(page.getByLabel('Project folder')).not.toHaveValue('');
  await page.getByLabel('How much should I ask you?').selectOption(mode);
  await page.getByRole('button', { name: 'Open my project' }).click();
  await expect(page.getByRole('button', { name: /^Switch project, current:/ })).toBeVisible();
}

/** Loads a Scenario panel entry by its label (dev/e2e builds only). */
export async function loadScenario(page: Page, label: string | RegExp) {
  const panel = page.getByRole('complementary', { name: 'Scenarios' });
  // The panel's code loads lazily, so the first press can land before it listens.
  for (let i = 0; i < 20 && !(await panel.isVisible()); i++) {
    await page.keyboard.press('ControlOrMeta+Shift+D');
    await page.waitForTimeout(150);
  }
  await panel.getByRole('button', { name: label, exact: typeof label === 'string' }).click();
  await page.keyboard.press('ControlOrMeta+Shift+D');
  await expect(panel).toBeHidden();
}
