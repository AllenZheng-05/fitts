import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers/axe';
import { completeSetup, loadScenario } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';
import { expectNoWindowScrollAt } from './helpers/layout';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async () => {
  await launched.close();
});

test('first launch: setup creates a project and opens its workspace', async () => {
  const { page } = launched;
  const open = page.getByRole('button', { name: 'Open my project' });
  await expect(open).toBeDisabled();
  await expectNoSeriousA11yViolations(page);
  await expectNoWindowScrollAt(page, { width: 1200, height: 720 });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByLabel('Meta Model API key').fill('short');
  await page.waitForTimeout(700);
  await expect(page.getByRole('status').filter({ hasText: 'Works' })).toBeHidden();

  await page.getByRole('button', { name: 'Allow microphone' }).click();
  await expect(page.getByText('Microphone', { exact: true })).toBeVisible();

  await page.getByLabel('Project folder').fill('~/code/fitts/demo/chat');
  await expect(
    page.getByText('Vite + React 19 · dev server on localhost:5173 · you own it'),
  ).toBeVisible();
  await expect(open).toBeDisabled();

  await page.getByLabel('Project folder').fill('');
  await completeSetup(page, 'autonomous');
  await expect(
    page.getByRole('button', { name: 'Switch project, current: demo/chat' }),
  ).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Interview' }).first()).toHaveAttribute(
    'aria-current',
    'step',
  );
});

test('relaunch opens the last project instead of Welcome', async () => {
  await completeSetup(launched.page);
  const { userData } = launched;
  await launched.close({ keepUserData: true });
  launched = await launchApp({ userData });
  await expect(
    launched.page.getByRole('button', { name: 'Switch project, current: demo/chat' }),
  ).toBeVisible();
});

test('⌘P opens the project menu; ⌘, opens Settings; Esc closes each', async () => {
  const { page } = launched;
  await completeSetup(page);
  const projectButton = page.getByRole('button', { name: /^Switch project/ });

  await page.keyboard.press('ControlOrMeta+P');
  const menu = page.getByRole('dialog', { name: 'Projects' });
  await expect(menu).toBeVisible();
  await expect(page.getByPlaceholder('Find a project…')).toBeFocused();
  await expectNoSeriousA11yViolations(page);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(projectButton).toBeFocused();

  await page.keyboard.press('ControlOrMeta+,');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(projectButton).toBeVisible();
});

test('the project menu searches and switches projects', async () => {
  const { page } = launched;
  await loadScenario(page, 'Project menu');
  const menu = page.getByRole('dialog', { name: 'Projects' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: /demo\/chat/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await page.getByPlaceholder('Find a project…').fill('hart');
  await expect(menu.getByRole('button', { name: /demo\/chat/ })).toBeHidden();
  await menu.getByRole('button', { name: /hartwell-site/ }).click();
  await expect(
    page.getByRole('button', { name: 'Switch project, current: hartwell-site' }),
  ).toBeVisible();
});

test('Add a project: code folder and live site', async () => {
  const { page } = launched;
  await loadScenario(page, 'Add project');
  const dialog = page.getByRole('dialog', { name: 'Add a project' });
  await expect(dialog).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  const submit = dialog.getByRole('button', { name: 'Add and open' });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Project folder').fill('~/code/portfolio');
  await expect(dialog.getByText('Next.js 15 detected')).toBeVisible();
  await expect(
    dialog.getByText('Fixes will be less precise without the Fitts source plugin'),
  ).toBeVisible();
  await expect(dialog.getByLabel('Name')).toHaveValue('portfolio');

  await dialog.getByRole('tab', { name: /Live site only/ }).click();
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Site URL').fill('https://shop.example.com');
  await dialog.getByRole('button', { name: 'Check now' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Verified' })).toBeVisible();
  await submit.click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Switch project, current: shop.example.com' }),
  ).toBeVisible();
});

test('Settings: dangerous mode needs the typed sentence', async () => {
  const { page } = launched;
  await completeSetup(page);
  await page.keyboard.press('ControlOrMeta+,');
  const toggle = page.getByRole('switch', { name: 'Dangerous mode' });
  await expect(toggle).toBeDisabled();
  await page
    .getByLabel(/^Type "I understand Fitts may delete data"/)
    .fill('I understand Fitts may delete data');
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expectNoSeriousA11yViolations(page);

  await page.getByRole('button', { name: 'Back to workspace' }).click();
  const banner = page.getByRole('status').filter({ hasText: 'PERMISSIONS SKIPPED' });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Turn off' }).click();
  await expect(banner).toBeHidden();
});

test('Settings: Open weights stays disabled until a Baseten key exists', async () => {
  const { page } = launched;
  await completeSetup(page);
  await page.keyboard.press('ControlOrMeta+,');
  const openWeights = page.getByRole('button', { name: 'Open weights' });
  await expect(openWeights).toBeDisabled();

  await page.getByRole('button', { name: 'Add a Baseten key first' }).click();
  await expect(page.getByRole('button', { name: 'API keys' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expectNoSeriousA11yViolations(page);
  const baseten = page.getByRole('listitem').filter({ hasText: 'Baseten' });
  await baseten.getByRole('button', { name: 'Add key' }).click();
  await baseten.getByLabel('Baseten key').fill('baseten-key-123');
  await baseten.getByRole('button', { name: 'Save key' }).click();
  await expect(baseten.getByText('Works')).toBeVisible();

  await page.getByRole('button', { name: 'Run & permissions' }).click();
  await expect(openWeights).toBeEnabled();
  await openWeights.click();
  await expect(openWeights).toHaveAttribute('aria-pressed', 'true');
});

test('Settings tabs are axe-clean and never scroll the window', async () => {
  const { page } = launched;
  await loadScenario(page, 'Settings');
  for (const tab of ['Run & permissions', 'Voice & appearance', 'API keys', 'Projects']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await expectNoSeriousA11yViolations(page);
    await expectNoWindowScrollAt(page, { width: 1200, height: 720 });
    await page.setViewportSize({ width: 1440, height: 900 });
  }
});

test('Settings: rename and remove a project', async () => {
  const { page } = launched;
  await loadScenario(page, 'Settings');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'portfolio' });
  await row.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('New name for portfolio').fill('my-portfolio');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('my-portfolio')).toBeVisible();

  await page
    .getByRole('listitem')
    .filter({ hasText: 'my-portfolio' })
    .getByRole('button', { name: 'Remove' })
    .click();
  const confirm = page.getByRole('dialog', { name: 'Remove my-portfolio from Fitts?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Remove from Fitts' }).click();
  await expect(page.getByText('my-portfolio')).toBeHidden();
});

test('Settings: add a project from the Projects tab', async () => {
  const { page } = launched;
  await loadScenario(page, 'Settings');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: '+ Add a project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a project' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('Welcome back lists projects', async () => {
  const { page } = launched;
  await loadScenario(page, 'Welcome back');
  await expect(page.getByRole('heading', { name: 'Welcome back, Allen' })).toBeVisible();
  await expect(page.getByText('Last run yesterday · 24 fixes · 9 PRs')).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await expectNoWindowScrollAt(page, { width: 1200, height: 720 });
  await page.getByRole('button', { name: 'Open hartwell-site' }).click();
  await expect(
    page.getByRole('button', { name: 'Switch project, current: hartwell-site' }),
  ).toBeVisible();
});
