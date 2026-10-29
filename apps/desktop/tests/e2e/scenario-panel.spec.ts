import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers/axe';
import { launchApp, type LaunchedApp } from './helpers/launch';
import { expectNoWindowScrollAt } from './helpers/layout';

let launched: LaunchedApp;

const panel = (page: Page) => page.getByRole('complementary', { name: 'Scenarios' });
const runTitle = (page: Page) => page.getByRole('heading', { level: 2 }).first();
const json = (page: Page) => page.locator('pre');

async function openPanel(page: Page) {
  await page.keyboard.press('ControlOrMeta+Shift+D');
  await expect(panel(page)).toBeVisible();
}

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.setViewportSize({ width: 1440, height: 900 });
  await expect(launched.page.getByRole('heading', { name: 'Run state' })).toBeVisible();
});

test.afterEach(async () => {
  await launched.close();
});

test('the shortcut toggles the panel, and Esc leaves it open', async () => {
  const { page } = launched;
  await expect(panel(page)).toBeHidden();
  await openPanel(page);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+D');
  await expect(panel(page)).toBeHidden();
});

test('switches scenarios', async () => {
  const { page } = launched;
  await openPanel(page);

  await panel(page).getByRole('button', { name: 'Interview' }).click();
  await expect(runTitle(page)).toContainText('run-7 · interview');
  await expect(json(page)).toContainText('"type": "brief"');

  await panel(page).getByRole('button', { name: 'Audit (Ask)' }).click();
  await expect(runTitle(page)).toContainText('audit · acting');
  await expect(json(page)).toContainText('One action, three names');
  await expect(panel(page).getByRole('button', { name: 'Audit (Ask)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await panel(page).getByRole('button', { name: 'Gate' }).click();
  await expect(runTitle(page)).toContainText('waiting for gate');
  await expect(json(page)).toContainText('"action": "Delete conversation"');

  await panel(page).getByRole('button', { name: 'Redesign' }).click();
  await expect(json(page)).toContainText('"projectId": "hartwell-site"');
  await expect(json(page)).toContainText('"selectedId": "quiet"');

  await panel(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(runTitle(page)).toContainText('done · idle');
});

test('screens that arrive later are disabled', async () => {
  const { page } = launched;
  await openPanel(page);
  await expect(
    panel(page).getByRole('button', { name: /Welcome \(first launch\)/ }),
  ).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: /^Settings/ })).toBeDisabled();
});

test('speed, restart and jump to beat', async () => {
  const { page } = launched;
  await openPanel(page);
  await panel(page).getByRole('button', { name: 'Audit (Ask)' }).click();

  await panel(page).getByRole('button', { name: '4×' }).click();
  await expect(panel(page).getByRole('button', { name: '4×' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await panel(page)
    .getByRole('combobox', { name: 'Jump to beat' })
    .selectOption({ label: '90s · Done' });
  await expect(runTitle(page)).toContainText('done · idle');

  await panel(page).getByRole('button', { name: 'Restart scenario' }).click();
  await expect(runTitle(page)).toContainText('audit · acting');
});

test('the debug view drives the engine', async () => {
  const { page } = launched;
  await openPanel(page);
  await panel(page).getByRole('button', { name: 'Gate' }).click();
  await page.getByRole('button', { name: "Don't do it" }).click();
  await expect(runTitle(page)).toContainText('audit · acting');
  await expect(json(page)).toContainText("Okay, I won't tap it. Moving on.");
});

test('is axe-clean and never scrolls the window', async () => {
  const { page } = launched;
  await openPanel(page);
  await panel(page).getByRole('button', { name: 'Audit (Ask)' }).click();
  await expectNoSeriousA11yViolations(page);
  await expectNoWindowScrollAt(page, { width: 1440, height: 900 });
  await expectNoWindowScrollAt(page, { width: 1200, height: 720 });
});
