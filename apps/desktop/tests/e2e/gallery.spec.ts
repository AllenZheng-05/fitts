import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers/axe';
import { launchApp, type LaunchedApp } from './helpers/launch';
import { expectNoWindowScrollAt } from './helpers/layout';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  const { page } = launched;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    window.location.hash = '#/gallery';
  });
  await expect(page.getByRole('heading', { name: 'Component gallery' })).toBeVisible();
});

test.afterEach(async () => {
  await launched.close();
});

test('has no serious accessibility violations', async () => {
  await expectNoSeriousA11yViolations(launched.page);
});

test('overlays are axe-clean while open', async () => {
  const { page } = launched;

  await page.getByTestId('open-popover').click();
  await expect(page.getByRole('dialog', { name: 'Brief' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.keyboard.press('Escape');

  await page.getByTestId('open-modal').click();
  await expect(page.getByRole('dialog', { name: 'Add a project' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.keyboard.press('Escape');

  await page.getByTestId('open-gate').click();
  const gate = page.getByRole('alertdialog', { name: 'This could delete real data' });
  await expect(gate).toBeVisible();
  await expect(gate.getByRole('button', { name: "Don't do it" })).toBeFocused();
  await expectNoSeriousA11yViolations(page);
  await page.keyboard.press('Escape');
  await expect(gate).toBeHidden();
  await expect(page.getByTestId('open-gate')).toBeFocused();
});

test('Esc closes only the topmost overlay', async () => {
  const { page } = launched;
  await page.getByTestId('open-modal').click();
  await page.getByRole('button', { name: 'Open a popover inside' }).click();
  await expect(page.getByText('Esc closes me first, then the dialog.')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByText('Esc closes me first, then the dialog.')).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Add a project' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Add a project' })).toBeHidden();
});

interface FocusSample {
  name: string;
  outline: string;
}

// 2px CSS is snapped to whole device pixels: at 125% scaling Chromium reports 1.6px.
const isFocusRing = (outline: string) => {
  const match = /^solid ([\d.]+)px rgb\(61, 90, 254\)$/.exec(outline);
  return match !== null && Number(match[1]) >= 1.5 && Number(match[1]) <= 2;
};

async function focusedSample(page: Page): Promise<FocusSample | null> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    const name =
      el.getAttribute('aria-label') ??
      (el.textContent ?? '').trim().slice(0, 40) ??
      el.tagName.toLowerCase();
    return {
      name: `${el.tagName.toLowerCase()} "${name}"`,
      outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
    };
  });
}

test('every control shows the focus ring', async () => {
  const { page } = launched;
  const seen: FocusSample[] = [];
  for (let i = 0; i < 250; i++) {
    await page.keyboard.press('Tab');
    const sample = await focusedSample(page);
    if (!sample) continue;
    if (seen.length > 0 && sample.name === seen[0]?.name) break;
    seen.push(sample);
  }

  expect(seen.length).toBeGreaterThan(60);
  const missing = seen.filter((s) => !isFocusRing(s.outline));
  expect(missing, missing.map((m) => `${m.name}: ${m.outline}`).join('\n')).toEqual([]);
});

test('never scrolls the window', async () => {
  await expectNoWindowScrollAt(launched.page, { width: 1440, height: 900 });
  await expectNoWindowScrollAt(launched.page, { width: 1200, height: 720 });
});

test('captures section screenshots for visual review', async () => {
  const { page } = launched;
  const ids = await page.locator('section[id^="g-"]').evaluateAll((els) => els.map((e) => e.id));
  for (const id of ids) {
    const section = page.locator(`#${id}`);
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: test.info().outputPath(`${id}.png`) });
  }
  expect(ids.length).toBeGreaterThan(10);
});
