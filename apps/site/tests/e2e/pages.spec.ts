// Every page loads, has one h1, marks itself in the nav, never scrolls sideways, and is axe
// clean (WCAG 2.0–2.2 A and AA, and best practice) on a desktop and a phone.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { blockOutside } from './offline';

test.beforeEach(blockOutside);

const PAGES = [
  { path: '/', h1: 'Fitts', nav: 'Fitts, home' },
  { path: '/how-it-works/', h1: 'How Fitts works', nav: 'How it works' },
  { path: '/checks/', h1: 'What Fitts checks', nav: 'What Fitts checks' },
  { path: '/showcase/', h1: 'Fitts at work', nav: 'Showcase' },
  { path: '/download/', h1: 'Download Fitts', nav: 'Download' },
];

const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const size of SIZES)
  test.describe(`${size.name} ${size.width}px`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    for (const p of PAGES)
      test(`${p.path} loads, is marked in the nav and is axe clean`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(p.path);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.h1);
        await expect(page).toHaveTitle(/Fitts/);
        await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{40,}/);
        await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
          'content',
          /og\.png$/,
        );

        // The current page is marked (in the menu, on a phone).
        if (size.width < 1024 && p.path !== '/') {
          await page.getByRole('button', { name: 'Menu' }).click();
        }
        const current = page.locator('[aria-current="page"]:visible');
        await expect(current.first()).toBeVisible();
        if (p.path === '/') await expect(current.first()).toHaveAccessibleName(p.nav);
        else await expect(current.filter({ hasText: p.nav }).first()).toBeVisible();

        expect(await sideways(page)).toBeLessThanOrEqual(0);

        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
        expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
        expect(errors).toEqual([]);
      });
  });

test.describe('320px reflow', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const p of [...PAGES, { path: '/404.html', h1: '', nav: '' }])
    test(`${p.path} doesn't scroll sideways`, async ({ page }) => {
      await page.goto(p.path);
      await page.waitForLoadState('networkidle');
      expect(await sideways(page)).toBeLessThanOrEqual(0);
    });
});

test('an unknown address gets the 404 page, with status 404', async ({ page }) => {
  // The preview server answers as Cloudflare Pages does (vite.config.ts pagesLikeCloudflare).
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('There’s no page here');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations).toEqual([]);
});

test('a page address without its slash redirects to it, and reloads as itself', async ({
  page,
}) => {
  for (const p of PAGES.filter((x) => x.path !== '/')) {
    await page.goto(p.path.slice(0, -1));
    await expect(page).toHaveURL(new RegExp(`${p.path}$`));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.h1);
  }
});

test('sitemap lists the five pages', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  for (const p of PAGES) expect(xml).toContain(`https://fitts.allenzheng.com${p.path}</loc>`);
});
