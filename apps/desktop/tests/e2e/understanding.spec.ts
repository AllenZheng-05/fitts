// The understanding card (SPEC-phase4 §3.3) in the test build: "Here's what I understand"
// shows during the interview with the summary, the counts, the journeys as checkboxes (priority
// 3 off by default), the notes, and its two answers.
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers/axe';
import { completeSetup } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';
import { expectNoWindowScrollAt } from './helpers/layout';

let launched: LaunchedApp;

const chat = (page: Page) => page.getByRole('log', { name: 'Conversation with Fitts' });
const card = (page: Page) =>
  chat(page).getByRole('listitem').filter({ hasText: 'Here’s what I understand' });

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.setViewportSize({ width: 1440, height: 900 });
  await completeSetup(launched.page);
});

test.afterEach(async () => {
  await launched.close();
});

test('the card shows the summary, counts, journeys and notes, and stays axe-clean', async () => {
  const { page } = launched;
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('8 pages · 12 features · 5 journeys');
  await expect(card(page)).toContainText('family messaging app');
  await expect(card(page)).toContainText('Things to confirm');
  const boxes = card(page).getByRole('checkbox');
  await expect(boxes).toHaveCount(5);
  // Priority 1 and 2 are on; the priority-3 one ("Turn a setting off") is off.
  await expect(
    card(page).getByRole('checkbox', { name: 'Test “Send a message to Grandma”' }),
  ).toBeChecked();
  await expect(
    card(page).getByRole('checkbox', { name: 'Test “Turn a setting off”' }),
  ).not.toBeChecked();
  await expectNoSeriousA11yViolations(page);
  await expectNoWindowScrollAt(page, { width: 1200, height: 720 });
});

test('"Looks right" answers with what was left out; the audit then starts as usual', async () => {
  const { page } = launched;
  await card(page).getByRole('checkbox', { name: 'Test “Find an old message”' }).uncheck();
  await card(page).getByRole('button', { name: 'Looks right' }).click();
  await expect(card(page)).toContainText('You said it looks right · 2 left out');
  await expect(card(page).getByRole('checkbox').first()).toBeDisabled();
  await page.getByRole('button', { name: 'Skip, just look around' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Audit & fix' })).toHaveAttribute(
    'aria-current',
    'step',
  );
});

test('"Change something" prefills the message box for a correction', async () => {
  const { page } = launched;
  await card(page).getByRole('button', { name: 'Change something' }).click();
  await expect(page.getByLabel('Message Fitts')).toHaveValue('Change the map: ');
  await expect(page.getByLabel('Message Fitts')).toBeFocused();
});
