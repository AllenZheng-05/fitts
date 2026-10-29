// Phase 2 P1: the UI runs on IpcRunEngine (the agent utility process), and runs are logged.
import { replay, type LoggedEvent } from '@fitts/schema';
import { expect, test } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { completeSetup } from './helpers/flows';
import { launchApp, type LaunchedApp } from './helpers/launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async () => {
  await launched.close();
});

test('a real interview runs through the agent process and lands in the event log', async () => {
  const { page, userData } = launched;
  await completeSetup(page);
  const box = page.getByLabel('Message Fitts');
  await box.fill('A messaging app so my grandparents can text the family.');
  await box.press('Enter');
  await expect(page.getByRole('button', { name: 'Start the audit' })).toBeVisible();

  // The project is a file, not localStorage.
  const projectsDir = join(userData, 'projects');
  const ids = readdirSync(projectsDir).filter((d) =>
    existsSync(join(projectsDir, d, 'project.json')),
  );
  expect(ids).toHaveLength(1);
  const id = ids[0] ?? '';

  // The run's events are on disk, and replaying them gives what the UI shows.
  const runsDir = join(projectsDir, id, 'runs');
  await expect.poll(() => (existsSync(runsDir) ? readdirSync(runsDir).length : 0)).toBe(1);
  const runId = readdirSync(runsDir)[0] ?? '';
  const events = readFileSync(join(runsDir, runId, 'events.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => (JSON.parse(l) as LoggedEvent).event);
  expect(events[0]?.type).toBe('run.started');
  const state = replay(events);
  expect(state?.phase).toBe('interview');
  expect(state?.brief.for).toBeTruthy();
  const shown = await page.getByRole('log', { name: 'Conversation with Fitts' }).textContent();
  for (const item of state?.chat ?? []) {
    if (item.type === 'fitts.message') expect(shown).toContain(item.text.replace(/\*\*/g, ''));
  }
});

test('projects persist in the file store across a relaunch', async () => {
  await completeSetup(launched.page);
  const { userData } = launched;
  await launched.close({ keepUserData: true });
  expect(existsSync(join(userData, 'projects', 'index.json'))).toBe(true);
  launched = await launchApp({ userData });
  await expect(
    launched.page.getByRole('button', { name: /^Switch project, current: demo\/chat/ }),
  ).toBeVisible();
});
