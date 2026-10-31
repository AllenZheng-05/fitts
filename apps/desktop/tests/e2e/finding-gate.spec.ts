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
  // Not fixed yet: the page as Fitts found it, and a note that the fixed version comes after.
  await expect(panel.getByText('Once I’ve fixed and checked this')).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await panel.getByRole('tab', { name: 'Evidence' }).click();
  await expect(panel).toContainText('Novice flagged it');
  await expect(panel.getByRole('tab', { name: 'Mockup' })).toHaveCount(0);

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

  // Changed your mind: it's open again, ready to fix.
  await card.click();
  await panel.getByRole('button', { name: 'It is a problem' }).click();
  await expect(panel.getByRole('button', { name: 'Fix it' })).toBeVisible();
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
  // The scripted run's PRs aren't on GitHub, so there's nothing to open.
  await expect(page.getByText('That was a practice run')).toBeVisible();
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

test('batch approval: review each steps through every fix, then answers the batch', async () => {
  const { page } = launched;
  await loadScenario(page, 'Batch approval');
  const card = chat(page).getByRole('listitem').filter({ hasText: '3 fixes are ready' });
  await card.getByRole('button', { name: 'Review each' }).click();

  const panel = page.getByRole('dialog');
  await expect(panel).toContainText('Fix 1 of 3');
  await expect(panel).toContainText('3 left to decide');
  await expect(panel.getByRole('button', { name: 'Previous fix' })).toBeDisabled();

  // Approve the first: the panel moves on to the second.
  await panel.getByRole('button', { name: 'Approve fix' }).click();
  await expect(panel).toContainText('Fix 2 of 3');
  await expect(panel).toContainText('2 left to decide');

  // Close mid-review: the card remembers where you got to.
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Continue review · 1 of 3 decided' }).click();
  await expect(panel).toContainText('Fix 2 of 3');

  // Back to the first shows your call on it.
  await panel.getByRole('button', { name: 'Previous fix' }).click();
  await expect(panel).toContainText('Fix 1 of 3');
  await expect(panel).toContainText('Approved');
  await panel.getByRole('button', { name: 'Next fix' }).click();

  // Skip the second, approve the third. Nothing is sent yet: every call can still change.
  await panel.getByRole('button', { name: 'Skip' }).click();
  await expect(panel).toContainText('Fix 3 of 3');
  await panel.getByRole('button', { name: 'Not a problem' }).click();
  await expect(panel).toContainText('0 left to decide');
  await expect(panel).toBeVisible();
  // Changed my mind: approve it instead.
  await panel.getByRole('button', { name: 'Approve fix' }).click();
  await expect(panel.getByRole('button', { name: 'Approve fix' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Go ahead sends them: the batch is answered with two of three.
  await panel.getByRole('button', { name: 'Go ahead · fix 2' }).click();
  await expect(panel).toBeHidden();
  await expect(card).toContainText('Approved 2 of 3');
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
  ['Budget warning', "I've used 80% of your $20 cap"],
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
  await expect(card.getByRole('button', { name: /Economy/ })).toHaveCount(0);

  // At 80% Economy is offered, while switching still stretches the budget.
  await loadScenario(page, 'Budget warning');
  const warning = chat(page)
    .getByRole('listitem')
    .filter({ hasText: "I've used 80% of your $20 cap" });
  await warning.getByRole('button', { name: 'Switch to Economy' }).click();
  await expect(chat(page)).toContainText('Switching to Economy for the rest of the run.');

  await loadScenario(page, 'Nothing found');
  await chat(page).getByRole('button', { name: 'See what I checked' }).click();
  await chat(page)
    .getByRole('button', { name: /Show all \d+ steps/ })
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
