import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers/axe';
import { loadScenario } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';
import { expectNoWindowScrollAt } from './helpers/layout';

let launched: LaunchedApp;

const chat = (page: Page) => page.getByRole('log', { name: 'Conversation with Fitts' });
const summary = (page: Page) => page.getByRole('region', { name: 'Run summary' });
const stat = (page: Page, label: string) =>
  summary(page)
    .locator('div')
    .filter({ has: page.getByText(label, { exact: true }) })
    .last();

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

test('Autonomous redesign: pick another direction, undo wording, reach Done', async () => {
  const { page } = launched;
  await loadScenario(page, 'Redesign');
  const site = page.getByRole('region', { name: 'Your site, before and after' });
  await expect(site).toBeVisible();
  await expect(site.getByText('AFTER · QUIET & DIGNIFIED')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Site map' })).toBeHidden();
  await expect(chat(page)).toContainText(
    'I mocked up three calmer directions and applied the one closest to what you described',
  );
  await expectNoSeriousA11yViolations(page);
  await expectNoWindowScrollAt(page, { width: 1200, height: 720 });
  await page.setViewportSize({ width: 1440, height: 900 });

  const directions = page.getByRole('group', { name: 'Design directions' });
  await expect(directions.getByRole('button', { name: 'Quiet & dignified' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // A click opens the direction large; you choose it from there.
  await directions.getByRole('button', { name: 'Warm & personal' }).click();
  const viewer = page.getByRole('dialog', { name: 'Warm & personal' });
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: 'Choose this one' }).click();
  await expect(viewer).toBeHidden();
  await expect(site.getByText('AFTER · WARM & PERSONAL')).toBeVisible();

  await page.getByRole('button', { name: 'Every page' }).click();
  await expect(site.getByText('/obituaries')).toBeVisible();
  await page.getByRole('button', { name: 'Every page' }).click();

  await setSpeed(page, '4×');
  const wording = chat(page)
    .getByRole('listitem')
    .filter({ hasText: 'Wording changed · undo each one separately' });
  await expect(wording).toBeVisible({ timeout: 20_000 });
  await wording.getByRole('button', { name: 'Undo this' }).click();
  await expect(wording).toContainText('Undone');

  await expect(summary(page)).toBeVisible({ timeout: 20_000 });
  await expect(summary(page)).toContainText('Redesign: Quiet & dignified');
  await expect(summary(page)).toContainText('PR #22');
});

test('Redesign in an Ask mode waits for a pick', async () => {
  const { page } = launched;
  await loadScenario(page, 'Welcome back');
  await page.getByRole('button', { name: /^hartwell-site Last run/ }).click();
  await expect(chat(page)).toContainText('Anything changed since last time?');
  await page.getByLabel('Permission mode').selectOption('ask-unsure');
  await page.getByRole('button', { name: 'Start the audit' }).click();
  await setSpeed(page, '4×');
  const directions = page.getByRole('group', { name: 'Design directions' });
  await expect(directions).toBeVisible({ timeout: 20_000 });
  await expect(chat(page)).toContainText("Pick the one that feels right and I'll apply it.");
  await expect(page.getByRole('region', { name: 'Fitts' }).getByRole('status').first()).toHaveText(
    'Waiting on you',
  );
  await page.waitForTimeout(2_000);
  await expect(chat(page)).not.toContainText('Applying the look');
  await directions.getByRole('button', { name: 'Classic & formal' }).click();
  await expect(chat(page)).not.toContainText('Applying the look');
  await page
    .getByRole('dialog', { name: 'Classic & formal' })
    .getByRole('button', { name: 'Choose this one' })
    .click();
  await expect(chat(page)).toContainText('Applying the look');
});

test('Done: stats, undo and redo, try again, all changes', async () => {
  const { page } = launched;
  await loadScenario(page, 'Done');
  await expect(stat(page, 'Found')).toContainText('31');
  await expect(stat(page, 'Fixed & verified')).toContainText('24');
  await expect(stat(page, 'Pull requests')).toContainText('9');
  await expect(stat(page, 'Spent')).toContainText('$13.92');
  await expect(summary(page)).toContainText(
    '31 found = 24 fixed + 2 rolled back + 3 you marked "not a problem" + 2 still open.',
  );
  await expect(page.getByLabel('Address')).toHaveValue('localhost:5180/compose/confirm');
  await expect(page.getByText('Sent to Grandma ✓')).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await expectNoWindowScrollAt(page, { width: 1200, height: 720 });
  await page.setViewportSize({ width: 1440, height: 900 });

  const sent = summary(page).getByRole('listitem').filter({ hasText: "Show 'Sent' confirmation" });
  await sent.getByRole('button', { name: 'Undo' }).click();
  await expect(sent).toContainText('Undone');
  await expect(stat(page, 'Fixed & verified')).toContainText('23');
  await sent.getByRole('button', { name: 'Redo' }).click();
  await expect(stat(page, 'Fixed & verified')).toContainText('24', { timeout: 6_000 });

  const merged = summary(page).getByRole('listitem').filter({ hasText: 'One name per action' });
  await merged.getByRole('button', { name: 'Undo' }).click();
  await expect(merged).toContainText('Revert PR #21 opened');

  const rolled = summary(page)
    .getByRole('listitem')
    .filter({ hasText: 'Broke the phone layout on /settings' });
  await rolled.getByRole('button', { name: 'Try again' }).click();
  // Trying again shows the audit page, to watch it work; Done is a click back.
  await expect(chat(page)).toBeVisible();
  await page
    .getByRole('list', { name: 'Run progress' })
    .getByRole('button', { name: 'Show Done' })
    .click();
  await expect(stat(page, 'Fixed & verified')).toContainText('24', { timeout: 6_000 });

  await summary(page).getByRole('button', { name: 'See all 26 changes' }).click();
  await expect(summary(page).getByText('Roomier settings rows')).toBeVisible();
  await expect(
    summary(page).getByRole('list', { name: 'What I changed' }).getByRole('listitem'),
  ).toHaveCount(26);
});

test('Done: export, run picker, new run', async () => {
  const { page, userData } = launched;
  await loadScenario(page, 'Done');
  await summary(page).getByRole('button', { name: 'Export report' }).click();
  await expect(page.getByText('Report saved')).toBeVisible();
  const report = readFileSync(join(userData, 'report.md'), 'utf8');
  expect(report).toContain('# Fitts report · demo/chat · Run #7');
  expect(report).toContain('- Found: 31');

  await summary(page).getByLabel('Run').selectOption({ label: 'Run #6 · yesterday' });
  await expect(stat(page, 'Found')).toContainText('18');
  await expect(summary(page)).toContainText('This is an earlier run.');
  await summary(page).getByLabel('Run').selectOption({ label: 'Run #7 · today' });

  await summary(page).getByRole('button', { name: 'New run' }).click();
  await expect(chat(page)).toContainText('Anything changed since last time?');
  await expect(page.getByText('I know enough to start')).toBeVisible();
});

test('Done: every finding is listed, and one opens with its evidence beside the site', async () => {
  const { page } = launched;
  await loadScenario(page, 'Done');
  const list = summary(page).getByRole('list', { name: /^What I found/ });
  const row = list.getByRole('button').first();
  await expect(row).toBeVisible();
  const title = (await row.locator('span.font-semibold').first().innerText()).trim();
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  const panel = page.getByRole('dialog', { name: title });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('tab', { name: 'Evidence' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expectNoWindowScrollAt(page, { width: 1200, height: 720 });
});

test('Done: the audit page is a click away, and back', async () => {
  const { page } = launched;
  await loadScenario(page, 'Done');
  const stepper = page.getByRole('list', { name: 'Run progress' });
  await stepper.getByRole('button', { name: 'Show Audit & fix' }).click();
  await expect(page.getByRole('region', { name: 'Run summary' })).toHaveCount(0);
  await expect(page.getByRole('log', { name: 'Conversation with Fitts' })).toBeVisible();
  await expect(stepper.getByRole('button', { name: 'Show Audit & fix' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expectNoSeriousA11yViolations(page);
  await stepper.getByRole('button', { name: 'Show Done' }).click();
  await expect(page.getByRole('region', { name: 'Run summary' })).toBeVisible();
});
