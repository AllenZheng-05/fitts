// Fixes from the full-frontend audit (docs/DECISIONS.md, "Frontend audit fixes").
import { expect, test, type Page } from '@playwright/test';
import { loadScenario } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';

let launched: LaunchedApp;

const chat = (page: Page) => page.getByRole('log', { name: 'Conversation with Fitts' });
const status = (page: Page) =>
  page.getByRole('region', { name: 'Fitts' }).getByRole('status').first();
const tray = (page: Page) => page.getByRole('region', { name: /Findings · / });

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async () => {
  await launched.close();
});

test('the interview says "Your turn", not "Listening", and nobody is driving', async () => {
  const { page } = launched;
  await loadScenario(page, 'Interview');
  await expect(status(page)).toHaveText('Your turn');
  await expect(page.getByText("Yours to click · I haven't touched anything")).toBeVisible();
  await expect(page.getByText("You're driving")).toHaveCount(0);
});

test('"Now:" only shows while Fitts acts; waiting and paused say so instead', async () => {
  const { page } = launched;
  await loadScenario(page, 'Site down');
  await expect(page.getByText(/^Waiting on you · then:/)).toBeVisible();
  await expect(page.getByText(/^Now:/)).toHaveCount(0);

  await loadScenario(page, 'Stop run confirm');
  await expect(page.getByText(/^Paused · up next:/)).toBeVisible();
  await expect(page.getByText(/^Now:/)).toHaveCount(0);
});

test("a short window gives the open Finding panel the tray's height", async () => {
  const { page } = launched;
  await loadScenario(page, 'Finding panel (Ask)');
  await expect(tray(page)).toBeVisible();
  await page.setViewportSize({ width: 1200, height: 720 });
  await expect(tray(page)).toBeHidden();
  const panel = page.getByRole('dialog', { name: 'One action, three names' });
  await expect(panel.getByRole('slider', { name: 'Compare before and after' })).toBeInViewport();
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(tray(page)).toBeVisible();
});

test('a live site is audit-only: no Before / after toggle', async () => {
  const { page } = launched;
  await loadScenario(page, 'Nothing found');
  await expect(page.getByRole('button', { name: 'Before / after' })).toHaveCount(0);
});

test('Nothing found matches its counters and can finish the run', async () => {
  const { page } = launched;
  await loadScenario(page, 'Nothing found');
  await expect(page.getByText('Step 46 of about 46')).toBeVisible();
  await expect(page.getByText('Controls tried · 24 of 24')).toBeVisible();
  await expect(tray(page)).toContainText('your site holds up');
  await chat(page).getByRole('button', { name: 'Finish the run' }).click();
  await expect(page.getByText('Nothing to change this time.')).toBeVisible();
  await expect(page.getByText('Your site as it is now · nothing was changed')).toBeVisible();
});

test('a background project waiting on you shows on the project button and in the menu', async () => {
  const { page } = launched;
  await loadScenario(page, 'Background project needs you');
  const button = page.getByRole('button', { name: /Switch project, current: demo\/chat/ });
  await expect(button).toHaveAccessibleName(/1 other project needs you/);
  await button.click();
  await expect(
    page.getByRole('dialog', { name: 'Projects' }).getByRole('button', { name: /hartwell-site/ }),
  ).toContainText('Needs you');
});

test('taking the wheel while rewound goes back to live first', async () => {
  const { page } = launched;
  await loadScenario(page, 'Audit (Ask)');
  await page.getByRole('button', { name: 'Rewind to "(null)" shown as a name' }).click();
  await expect(page.getByText(/^Rewound · step/)).toBeVisible();
  await page
    .getByRole('group', { name: 'Run controls' })
    .getByRole('button', { name: 'Take the wheel' })
    .click();
  await expect(page.getByText(/^Rewound · step/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Back to live' })).toHaveCount(0);
});
