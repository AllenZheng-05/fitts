import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers/axe';
import { getWindowMetrics, launchApp, setContentSize, type LaunchedApp } from './helpers/launch';
import { expectNoWindowScrollAt } from './helpers/layout';

// Fractional display scaling (e.g. 125% on Windows) rounds window sizes by a pixel or two.
const DPI_SLACK = 2;

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

test('opens at 1440×900, or as large as the screen allows', async () => {
  const { content, outer, workArea } = await getWindowMetrics(launched.app);
  const frame = { width: outer.width - content.width, height: outer.height - content.height };
  const expected = {
    width: Math.min(1440, workArea.width - frame.width),
    height: Math.min(900, workArea.height - frame.height),
  };
  expect(Math.abs(content.width - expected.width)).toBeLessThanOrEqual(DPI_SLACK);
  expect(Math.abs(content.height - expected.height)).toBeLessThanOrEqual(DPI_SLACK);
});

test('paints the paper background', async () => {
  const background = await launched.page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(background).toBe('rgb(251, 250, 247)');
});

test('enforces the 1200×720 minimum content size', async () => {
  const { app } = launched;
  await setContentSize(app, 800, 600);
  const { content } = await getWindowMetrics(app);
  expect(content.width).toBeGreaterThanOrEqual(1200 - DPI_SLACK);
  expect(content.height).toBeGreaterThanOrEqual(720 - DPI_SLACK);
});

test('never scrolls the window at 1440×900 or 1200×720', async () => {
  await expectNoWindowScrollAt(launched.page, { width: 1440, height: 900 });
  await expectNoWindowScrollAt(launched.page, { width: 1200, height: 720 });
});

test('loads the bundled fonts', async () => {
  const { page } = launched;
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(async () => {
    const families = ['Bricolage Grotesque', 'Geist', 'Geist Mono'];
    await Promise.all(families.map((f) => document.fonts.load(`700 16px "${f}"`)));
    return families.filter((f) =>
      [...document.fonts].some(
        (face) => face.family.replace(/"/g, '') === f && face.status === 'loaded',
      ),
    );
  });
  expect(loaded).toEqual(['Bricolage Grotesque', 'Geist', 'Geist Mono']);
});

test('exposes only the preload bridge to the renderer', async () => {
  const { page } = launched;
  const probe = await page.evaluate(() => ({
    platform: window.fitts.platform,
    hasRequire: typeof (window as unknown as { require?: unknown }).require !== 'undefined',
    hasProcess: typeof (window as unknown as { process?: unknown }).process !== 'undefined',
  }));
  expect(['darwin', 'win32', 'linux']).toContain(probe.platform);
  expect(probe.hasRequire).toBe(false);
  expect(probe.hasProcess).toBe(false);
});

test('has no serious accessibility violations', async () => {
  await expectNoSeriousA11yViolations(launched.page);
});
