// Phones, reduced motion and Save-Data get the still image and never download the WebGL
// bundle; a desktop gets the 3D field, lazily, and it never takes a click from the content.
import { expect, test, type Page } from '@playwright/test';

/** Every request for the field's chunk (three.js, Rapier), while the page settles. */
function watchField(page: Page) {
  const fetched: string[] = [];
  page.on('request', (r) => {
    if (/\/assets\/ShapeField-[^/]+\.js$/.test(r.url())) fetched.push(r.url());
  });
  return fetched;
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
}

test.describe('a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const path of ['/', '/checks/'])
    test(`${path} gets the still image, not WebGL`, async ({ page }) => {
      const fetched = watchField(page);
      await page.goto(path);
      await settle(page);
      await expect(page.locator('svg[data-field-still]')).toHaveCount(1);
      await expect(page.locator('[data-shape-field], canvas')).toHaveCount(0);
      expect(fetched).toEqual([]);
    });
});

test.describe('reduced motion on a desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  test('gets the still image, not WebGL', async ({ page }) => {
    const fetched = watchField(page);
    await page.goto('/');
    await settle(page);
    await expect(page.locator('svg[data-field-still]')).toHaveCount(1);
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(fetched).toEqual([]);
  });
});

test.describe('Save-Data on a desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('gets the still image, not WebGL', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { value: { saveData: true } });
    });
    const fetched = watchField(page);
    await page.goto('/');
    await settle(page);
    await expect(page.locator('svg[data-field-still]')).toHaveCount(1);
    expect(fetched).toEqual([]);
  });
});

test.describe('a narrow desktop window', () => {
  test.use({ viewport: { width: 760, height: 900 } });
  test('gets the still image, not WebGL', async ({ page }) => {
    const fetched = watchField(page);
    await page.goto('/');
    await settle(page);
    await expect(page.locator('svg[data-field-still]')).toHaveCount(1);
    expect(fetched).toEqual([]);
  });
});

test.describe('a desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('gets the 3D field after the page is up, lively on Home and calm elsewhere', async ({
    page,
  }) => {
    const fetched = watchField(page);
    await page.goto('/');
    // The page is usable before the field arrives: the buttons are there at once.
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Download', exact: true }),
    ).toBeVisible();
    await expect(page.locator('[data-shape-field="lively"] canvas')).toHaveCount(1, {
      timeout: 15000,
    });
    // Once drawn, the still image under it goes.
    await expect(page.locator('svg[data-field-still]')).toHaveCount(0, { timeout: 15000 });
    expect(fetched.length).toBe(1);
    await page.goto('/download/');
    await expect(page.locator('[data-shape-field="calm"] canvas')).toHaveCount(1, {
      timeout: 15000,
    });
  });

  test('never takes a click from the content', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-shape-field] canvas')).toHaveCount(1, { timeout: 15000 });
    const field = page.locator('[data-shape-field]');
    await expect(field).toHaveCSS('pointer-events', 'none');
    await page.getByRole('link', { name: 'How it works' }).first().click();
    await expect(page).toHaveURL(/\/how-it-works\/$/);
  });
});
