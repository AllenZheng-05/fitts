// SPEC §12: axe (no serious or critical issues) and the layout guard (no window scroll at
// 1440×900 and 1200×720) on every Scenario panel entry.
import { test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers/axe';
import { loadScenario } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';
import { expectNoWindowScrollAt } from './helpers/layout';

const SCENARIOS = [
  'Welcome (first launch)',
  'Welcome back',
  'Interview',
  'Audit (Ask)',
  'Audit (Autonomous)',
  'Finding panel (Ask)',
  'Finding panel (Autonomous)',
  'Gate',
  'Redesign',
  'Done',
  'Settings',
  'Project menu',
  'Add project',
  'Brief',
  'Stop run confirm',
  'Stopped one action',
  "You're driving",
  'Uncommitted changes',
  'Login wall',
  'Batch approval',
  'Site down',
  'Budget warning',
  'Budget reached',
  'API trouble',
  'Reopen after crash',
  'Background project needs you',
  'Nothing found',
  'Returning-user home',
];

let launched: LaunchedApp;

test.beforeAll(async () => {
  launched = await launchApp();
});

test.afterAll(async () => {
  await launched.close();
});

for (const label of SCENARIOS) {
  test(`${label}: axe-clean and no window scroll`, async () => {
    const { page } = launched;
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadScenario(page, label);
    await page.waitForTimeout(300);
    await expectNoSeriousA11yViolations(page);
    await expectNoWindowScrollAt(page, { width: 1440, height: 900 });
    await expectNoWindowScrollAt(page, { width: 1200, height: 720 });
    await expectNoSeriousA11yViolations(page);
  });
}
