import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers/axe';
import { loadScenario } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';

let launched: LaunchedApp;

const chat = (page: Page) => page.getByRole('log', { name: 'Conversation with Fitts' });
const tray = (page: Page) => page.getByRole('region', { name: /Findings · / });
const messageBox = (page: Page) => page.getByLabel('Message Fitts');

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async () => {
  await launched.close();
});

test('Finding panel (Ask): open, change the fix, not a problem, Esc', async () => {
  const { page } = launched;
  await loadScenario(page, 'Audit (Ask)');
  await page.getByRole('button', { name: 'Pause' }).click();
  const card = tray(page)
    .getByRole('listitem')
    .filter({ hasText: 'One action, three names' })
    .getByRole('button');
  await card.click();
  const panel = page.getByRole('dialog', { name: 'One action, three names' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Severity 3 · Major');
  await expect(panel).toContainText('H4 Consistency and standards');
  await expect(panel).toContainText('4 of 5 agree');
  await expect(panel.getByRole('slider', { name: 'Compare before and after' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await panel.getByRole('tab', { name: 'Evidence' }).click();
  await expect(panel).toContainText('Novice flagged it');
  await panel.getByRole('tab', { name: 'Mockup' }).click();
  await expect(panel).toContainText('Mockup · not code');

  await panel.getByRole('button', { name: 'Change the fix' }).click();
  await expect(messageBox(page)).toHaveValue('For the button names, instead…');
  await expect(messageBox(page)).toBeFocused();

  await card.click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('region', { name: 'Fitts' }).getByRole('status').first()).toHaveText(
    'Paused',
  );

  await card.click();
  await panel.getByRole('button', { name: 'Not a problem' }).click();
  await expect(panel).toBeHidden();
  await expect(chat(page)).toContainText('Want to tell me why? It helps next time.');
  await expect(card).toContainText('Not a problem');
});

test('Finding panel: Fix it shows the fixing footer', async () => {
  const { page } = launched;
  await loadScenario(page, 'Audit (Ask)');
  await tray(page)
    .getByRole('listitem')
    .filter({ hasText: 'One action, three names' })
    .getByRole('button')
    .click();
  const panel = page.getByRole('dialog', { name: 'One action, three names' });
  await panel.getByRole('button', { name: 'Fix it' }).click();
  await expect(panel).toContainText('Fixing… re-checking at phone, tablet and desktop widths');
  await expect(panel.getByRole('progressbar', { name: 'Fixing' })).toBeVisible();
});

test('Finding panel (Autonomous): fixed footer and undo', async () => {
  const { page } = launched;
  await loadScenario(page, 'Finding panel (Autonomous)');
  const panel = page.getByRole('dialog', { name: 'One action, three names' });
  await expect(panel).toContainText('Fixed and verified ✓ · label check passes');
  await expectNoSeriousA11yViolations(page);
  await panel.getByRole('button', { name: 'View PR #12' }).click();
  await expect(page.getByText('PR #12 opens on GitHub in Phase 2.')).toBeVisible();
  await panel.getByRole('button', { name: 'Undo' }).click();
  await expect(panel).toContainText('Undone · PR #12 closed');
});

test('the destructive gate: focus, unlock, Esc means no', async () => {
  const { page } = launched;
  await loadScenario(page, 'Gate');
  const gate = page.getByRole('alertdialog', { name: 'This could delete real data' });
  await expect(gate).toBeVisible();
  await expect(gate.getByRole('button', { name: "Don't do it" })).toBeFocused();
  await expect(gate).toContainText('DELETE /api/conversations/12');
  await expect(gate).toContainText('Ask when unsure · this still asks, every time');
  const allow = gate.getByRole('button', { name: 'Allow once' });
  await expect(allow).toBeDisabled();
  await gate.getByLabel('I understand this may delete data on localhost:5173').check();
  await expect(allow).toBeEnabled();
  await expectNoSeriousA11yViolations(page);

  await page.keyboard.press('Escape');
  await expect(gate).toBeHidden();
  await expect(chat(page)).toContainText("Okay, I won't tap it. Moving on.");
});

test('Scenario A completes to Done after the gate', async () => {
  const { page } = launched;
  await loadScenario(page, 'Gate');
  const panel = page.getByRole('complementary', { name: 'Scenarios' });
  await page.keyboard.press('ControlOrMeta+Shift+D');
  await panel.getByRole('button', { name: '4×' }).click();
  await page.keyboard.press('ControlOrMeta+Shift+D');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Test something else' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: /^Done$/ })).toHaveAttribute(
    'aria-current',
    'step',
    { timeout: 30_000 },
  );
});

test('batch approval: review each opens the first finding', async () => {
  const { page } = launched;
  await loadScenario(page, 'Batch approval');
  const card = chat(page).getByRole('listitem').filter({ hasText: '3 fixes are ready' });
  await expect(card).toContainText('All 3 are serious.');
  await card.getByRole('button', { name: 'Review each' }).click();
  await expect(page.getByRole('dialog', { name: '"(null)" shown as a name' })).toBeVisible();
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Fix all 3' }).click();
  await expect(card).toContainText('Approved 3 of 3');
});

const EDGE_STATES: [string, string][] = [
  ['Stop run confirm', 'Stop this run?'],
  ['Stopped one action', 'Stopped. What should I do instead?'],
  ["You're driving", "You're driving. I'm watching."],
  ['Uncommitted changes', "You have 3 files you haven't committed"],
  ['Login wall', '/settings needs an account'],
  ['Batch approval', '3 fixes are ready'],
  ['Site down', 'Your site stopped responding'],
  ['Budget reached', "I've reached your $20 cap"],
  ['API trouble', "Meta's API isn't answering"],
  ['Reopen after crash', 'Pick up where we left off?'],
  ['Nothing found', 'Nothing here worth changing'],
];

test('every edge state is reachable and axe-clean', async () => {
  test.setTimeout(120_000);
  const { page } = launched;
  for (const [label, title] of EDGE_STATES) {
    await loadScenario(page, label);
    await expect(chat(page).getByText(title).first(), label).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  }
});

test('edge-state cards answer through the engine', async () => {
  const { page } = launched;
  await loadScenario(page, 'Budget reached');
  const card = chat(page).getByRole('listitem').filter({ hasText: "I've reached your $20 cap" });
  await card.getByRole('button', { name: 'Add $10' }).click();
  await expect(card).toContainText('You chose: Add $10');
  await expect(chat(page)).toContainText('Thanks. The cap is now $30. Carrying on.');

  await loadScenario(page, 'Nothing found');
  await chat(page).getByRole('button', { name: 'See what I checked' }).click();
  await chat(page)
    .getByRole('button', { name: /Show \d+ steps I took/ })
    .click();
  await expect(chat(page)).toContainText('Keyboard-only pass through each flow');
});

test('a background project needing you sends a notification that opens it', async () => {
  const { page, app } = launched;
  await loadScenario(page, 'Background project needs you');
  await expect(
    page.getByRole('button', { name: 'Switch project, current: demo/chat' }),
  ).toBeVisible();
  const sent = await app.evaluate(
    () =>
      (globalThis as { fittsNotifications?: { id: string; title: string; body: string }[] })
        .fittsNotifications ?? [],
  );
  const notification = sent.at(-1);
  expect(notification).toMatchObject({
    title: 'Fitts needs you',
    body: 'Can I submit the contact form with test data?',
  });
  await app.evaluate(({ BrowserWindow }, id) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('fitts:notification-click', id);
  }, notification?.id ?? '');
  await expect(
    page.getByRole('button', { name: 'Switch project, current: hartwell-site' }),
  ).toBeVisible();
  const question = chat(page)
    .getByRole('listitem')
    .filter({ hasText: 'Can I submit the contact form with test data?' });
  await expect(question).toContainText('I need you · paused');
  await question.getByRole('button', { name: 'Yes, use test data' }).click();
  await expect(question).toContainText('You answered: Yes, use test data');
});
