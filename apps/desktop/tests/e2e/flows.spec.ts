// SPEC §12 end-to-end flows, plus a keyboard-only pass.
import { expect, test, type Page } from '@playwright/test';
import { completeSetup, loadScenario } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';

let launched: LaunchedApp;

const chat = (page: Page) => page.getByRole('log', { name: 'Conversation with Fitts' });
const status = (page: Page) =>
  page.getByRole('region', { name: 'Fitts' }).getByRole('status').first();
const tray = (page: Page) => page.getByRole('region', { name: /Findings · / });
const step = (page: Page, name: RegExp) =>
  page.getByRole('list', { name: 'Run progress' }).getByRole('listitem').filter({ hasText: name });

async function setSpeed(page: Page, speed: '1×' | '4×') {
  const panel = page.getByRole('complementary', { name: 'Scenarios' });
  for (let i = 0; i < 20 && !(await panel.isVisible()); i++) {
    await page.keyboard.press('ControlOrMeta+Shift+D');
    await page.waitForTimeout(150);
  }
  await panel.getByRole('button', { name: speed }).click();
  await page.keyboard.press('ControlOrMeta+Shift+D');
}

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async () => {
  await launched.close();
});

test('§12.1 first launch → interview → audit → Fix it → gate → deny → done → undo', async () => {
  test.setTimeout(120_000);
  const { page } = launched;
  await completeSetup(page);
  await page
    .getByLabel('Message Fitts')
    .fill('A messaging app so my grandparents can text the family.');
  await page.getByLabel('Message Fitts').press('Enter');
  await page.getByRole('button', { name: 'Start the audit' }).click();
  await expect(step(page, /^Audit & fix/)).toHaveAttribute('aria-current', 'step');
  await setSpeed(page, '4×');

  const card = tray(page).getByRole('listitem').filter({ hasText: 'One action, three names' });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole('button').click();
  const panel = page.getByRole('dialog', { name: 'One action, three names' });
  await panel.getByRole('button', { name: 'Fix it' }).click();
  await expect(panel).toContainText('Fixing…');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  const approval = chat(page)
    .getByRole('listitem')
    .filter({ hasText: /fixes are ready/ });
  await expect(approval).toBeVisible({ timeout: 20_000 });
  await approval.getByRole('button', { name: /^Fix all/ }).click();

  const gate = page.getByRole('alertdialog', { name: 'This could delete real data' });
  await expect(gate).toBeVisible({ timeout: 30_000 });
  await gate.getByRole('button', { name: "Don't do it" }).click();
  await expect(chat(page)).toContainText("Okay, I won't tap it. Moving on.");

  await expect(step(page, /^Done$/)).toHaveAttribute('aria-current', 'step', { timeout: 30_000 });
  const summary = page.getByRole('region', { name: 'Run summary' });
  const row = summary.getByRole('listitem').filter({ hasText: "Show 'Sent' confirmation" });
  await row.getByRole('button', { name: 'Undo' }).click();
  await expect(row).toContainText('Undone · PR #13 closed');
});

test('§12.3 switching projects keeps the background run going', async () => {
  const { page } = launched;
  await loadScenario(page, 'Audit (Ask)');
  await page.keyboard.press('ControlOrMeta+P');
  const menu = page.getByRole('dialog', { name: 'Projects' });
  await menu.getByRole('button', { name: /hartwell-site/ }).click();
  await expect(
    page.getByRole('button', { name: 'Switch project, current: hartwell-site' }),
  ).toBeVisible();

  await page.keyboard.press('ControlOrMeta+P');
  const demo = menu.getByRole('button', { name: /demo\/chat/ });
  await expect(demo).toContainText('Running');
  const caption = async () => (await demo.textContent()) ?? '';
  const before = Number(/step (\d+)/.exec(await caption())?.[1]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2_000);
  await page.keyboard.press('ControlOrMeta+P');
  await expect
    .poll(async () => Number(/step (\d+)/.exec(await caption())?.[1]))
    .toBeGreaterThan(before);
});

test('§12.4 Esc closes the Finding panel without stopping Fitts', async () => {
  const { page } = launched;
  await loadScenario(page, 'Audit (Ask)');
  await tray(page)
    .getByRole('listitem')
    .filter({ hasText: 'One action, three names' })
    .getByRole('button')
    .click();
  await expect(page.getByRole('dialog', { name: 'One action, three names' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'One action, three names' })).toBeHidden();
  await expect(status(page)).toHaveText('Working');
  await page.keyboard.press('ControlOrMeta+.');
  await expect(chat(page)).toContainText('Stopped. What should I do instead?');
});

test('keyboard only: setup, interview and the audit', async () => {
  const { page } = launched;
  await expect(page.getByRole('heading', { name: "Hi, I'm Fitts." })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Meta Model API key')).toBeFocused();
  await page.keyboard.type('meta-key-12345');
  await expect(page.getByRole('status').filter({ hasText: 'Works' })).toBeVisible();
  await page.keyboard.press('Tab'); // Add ElevenLabs link
  await page.keyboard.press('Tab'); // Allow microphone
  await page.keyboard.press('Enter');
  await expect(page.getByText('Microphone', { exact: true })).toBeVisible();
  await page.getByLabel('Project folder').focus();
  await page.keyboard.type('~/code/fitts/demo/chat');
  await page.keyboard.press('Tab'); // Browse
  await page.keyboard.press('Tab'); // mode
  await page.keyboard.press('Tab'); // Open my project
  await expect(page.getByRole('button', { name: 'Open my project' })).toBeFocused();
  await page.keyboard.press('Enter');

  await page.keyboard.press('ControlOrMeta+L');
  await page.keyboard.type('A messaging app for my grandparents.');
  await page.keyboard.press('Enter');
  await expect(page.getByText('I know enough to start')).toBeVisible();
  await page.keyboard.press('Shift+Tab'); // Skip the rest
  await page.keyboard.press('Shift+Tab'); // Start the audit
  await expect(page.getByRole('button', { name: 'Start the audit' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(step(page, /^Audit & fix/)).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await expect(status(page)).toHaveText('Paused');
});

test('there is no push-to-talk key: Alt+Space does nothing', async () => {
  const { page } = launched;
  await completeSetup(page);
  await page.keyboard.down('Alt');
  await page.keyboard.press('Space');
  await page.keyboard.up('Alt');
  await page.waitForTimeout(300);
  await expect(page.getByRole('status').filter({ hasText: 'Mic on' })).toBeHidden();
  await expect(page.getByLabel('Message Fitts')).not.toHaveValue('Listening…');
});
