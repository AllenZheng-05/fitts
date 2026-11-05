// Full keyboard use: the skip link first, the menu, the loop's steps and the catalog's filters.
import { expect, test, type Page } from '@playwright/test';
import { blockOutside } from './offline';

test.beforeEach(blockOutside);

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * Pages render on the client, and `goto` can return before React has: a Tab pressed then focuses
 * nothing (CI on Linux, Nov 3: the first Tab on /download/ stayed on the body). Wait for the nav.
 */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeAttached();
}

test('Tab reaches the skip link first, and it moves to the content', async ({ page }) => {
  await open(page, '/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

for (const path of ['/download/', '/checks/'])
  test(`Tab reaches the skip link and the whole nav on ${path}, in order`, async ({ page }) => {
    await open(page, path);
    const names: string[] = [];
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab');
      names.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute('aria-label') ??
            document.activeElement?.textContent?.trim() ??
            '',
        ),
      );
    }
    expect(names).toEqual([
      'Skip to content',
      'Fitts, home',
      'How it works',
      'What Fitts checks',
      'Showcase',
      'Download',
      'Fitts on GitHub',
    ]);
  });

test('the checks filters are toggle buttons and the count is announced', async ({ page }) => {
  await page.goto('/checks/');
  const status = page.getByRole('status');
  await expect(status).toHaveText(/^Showing all \d+ checks$/);
  const keyboard = page.getByRole('button', { name: 'Keyboard', exact: true });
  await keyboard.focus();
  await page.keyboard.press('Enter');
  await expect(keyboard).toHaveAttribute('aria-pressed', 'true');
  await expect(status).toHaveText(/^Showing \d+ of \d+ checks$/);
  await expect(page.getByRole('heading', { name: 'Navigation', level: 3 })).toHaveCount(0);
  await page.getByRole('button', { name: 'All', exact: true }).press('Enter');
  await expect(status).toHaveText(/^Showing all/);
});

test('the loop opens each step from the keyboard', async ({ page }) => {
  await page.goto('/how-it-works/');
  const fix = page.getByRole('button', { name: /Fix/ }).first();
  await fix.focus();
  await page.keyboard.press('Space');
  await expect(fix).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('region', { name: 'Fix' })).toContainText('Muse Code');
});

test.describe('phone menu', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('opens with the keyboard and Esc closes it, returning focus', async ({ page }) => {
    await page.goto('/');
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator(`[id="${await menu.getAttribute('aria-controls')}"]`);
    await expect(panel.getByRole('link', { name: 'What Fitts checks' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
  });
});
