import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers/axe';
import { loadScenario } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';
import { expectNoWindowScrollAt } from './helpers/layout';

let launched: LaunchedApp;

const chat = (page: Page) => page.getByRole('log', { name: 'Conversation with Fitts' });
const status = (page: Page) =>
  page.getByRole('region', { name: 'Fitts' }).getByRole('status').first();
const runControls = (page: Page) => page.getByRole('group', { name: 'Run controls' });
const address = (page: Page) => page.getByLabel('Address');

async function setSpeed(page: Page, speed: '1×' | '2×' | '4×') {
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
  await loadScenario(launched.page, 'Audit (Ask)');
});

test.afterEach(async () => {
  await launched.close();
});

test('the audit screen is axe-clean and never scrolls', async () => {
  const { page } = launched;
  await expect(page.getByRole('heading', { name: 'Findings · 2 so far' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Site map' })).toBeVisible();
  await expect(page.getByText(/^Step \d+ of about 120$/)).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await expectNoWindowScrollAt(page, { width: 1440, height: 900 });
  await expectNoWindowScrollAt(page, { width: 1200, height: 720 });
});

test('Scenario A plays through the approval to the gate', async () => {
  const { page } = launched;
  await setSpeed(page, '4×');
  const approval = chat(page).getByRole('listitem').filter({ hasText: '3 fixes are ready' });
  await expect(approval).toBeVisible({ timeout: 20_000 });
  await expect(status(page)).toHaveText('Waiting on you');
  await approval.getByRole('button', { name: 'Fix all 3' }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: /Audit & fix\s*2 fixing/ }),
  ).toBeVisible();
  await expect(chat(page)).toContainText("Fixed and verified ✓ · Show 'Sent' confirmation", {
    timeout: 20_000,
  });
  await expect(address(page)).toHaveValue('localhost:5173/contacts/grandma', { timeout: 20_000 });
  await expect(status(page)).toHaveText('Waiting on you');
});

test('⌘. stops the current action and shows the Stopped card', async () => {
  const { page } = launched;
  await page.keyboard.press('ControlOrMeta+.');
  const card = chat(page)
    .getByRole('listitem')
    .filter({ hasText: 'Stopped. What should I do instead?' });
  await expect(card).toBeVisible();
  await expect(status(page)).toHaveText('Paused');
  await card.getByRole('button', { name: 'Resume' }).click();
  await expect(status(page)).toHaveText('Working');
});

test('Esc never stops Fitts', async () => {
  const { page } = launched;
  await page.keyboard.press('Escape');
  await expect(status(page)).toHaveText('Working');
});

test('pause and resume from the header and ⌘⇧P', async () => {
  const { page } = launched;
  await runControls(page).getByRole('button', { name: 'Pause' }).click();
  await expect(status(page)).toHaveText('Paused');
  await expect(runControls(page).getByRole('button', { name: 'Resume' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await expect(status(page)).toHaveText('Working');
});

test('a message sent mid-action is queued; Interrupt now delivers it', async () => {
  const { page } = launched;
  await page.getByLabel('Message Fitts').fill('check search next');
  await page.getByLabel('Message Fitts').press('Enter');
  await expect(page.getByText('Queued: "check search next"')).toBeVisible();
  await page.getByRole('button', { name: 'Interrupt now' }).click();
  await expect(page.getByText('Queued: "check search next"')).toBeHidden();
  await expect(chat(page)).toContainText("Got it, I'll work that in.");
});

test('take the wheel, click around, hand back', async () => {
  const { page } = launched;
  await runControls(page).getByRole('button', { name: 'Take the wheel' }).click();
  await expect(chat(page)).toContainText("You're driving. I'm watching.");
  await expect(status(page)).toHaveText("You're driving");
  const site = page.getByRole('region', { name: 'Your site' });
  await site.getByRole('button', { name: 'Create Message' }).click();
  await expect(address(page)).toHaveValue('localhost:5173/compose/confirm');
  await runControls(page).getByRole('button', { name: 'Hand back to Fitts' }).click();
  await expect(chat(page)).toContainText(
    'Thanks. You went through Create Message. Want me to test that path properly?',
  );
  await chat(page).getByRole('button', { name: 'Yes' }).last().click();
  await expect(chat(page)).toContainText('Testing your path');
});

test('filters, rewind and back to live', async () => {
  const { page } = launched;
  const tray = page.getByRole('region', { name: /Findings · / });
  await tray.getByRole('button', { name: 'Performance' }).click();
  await expect(tray.getByText('No findings in this group yet.')).toBeVisible();
  await tray.getByRole('button', { name: 'All' }).click();

  await page.getByRole('button', { name: 'Rewind to "(null)" shown as a name' }).click();
  await expect(address(page)).toHaveValue(/· rewound to step 19$/);
  await page.getByRole('button', { name: 'Back to live' }).click();
  await expect(address(page)).not.toHaveValue(/rewound/);
});

test('Stop run asks first, then ends at Done', async () => {
  const { page } = launched;
  await runControls(page).getByRole('button', { name: 'Stop run' }).click();
  const card = chat(page).getByRole('listitem').filter({ hasText: 'Stop this run?' });
  await expect(card).toContainText("I'll keep all 2 findings.");
  await card.getByRole('button', { name: 'Keep going' }).click();
  await expect(status(page)).toHaveText('Working');
  await runControls(page).getByRole('button', { name: 'Stop run' }).click();
  await chat(page)
    .getByRole('listitem')
    .filter({ hasText: 'Stop this run?' })
    .last()
    .getByRole('button', { name: 'Stop run' })
    .click();
  await expect(page.getByRole('listitem').filter({ hasText: /^Done$/ })).toHaveAttribute(
    'aria-current',
    'step',
  );
});
