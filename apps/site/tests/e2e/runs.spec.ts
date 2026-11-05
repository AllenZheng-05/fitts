// /runs/ and every published run report: loads, is axe clean, never scrolls sideways (down to
// 320 px), loads nothing from outside its own folder, and links back to the site.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { featuredRun, published, runPath } from '../../src/content/runs';
import { blockOutside } from './offline';

test.beforeEach(blockOutside);

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`,
  );

for (const width of [1440, 390, 320])
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('/runs/ lists every published run', async ({ page }) => {
      await page.goto('/runs/');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Real runs');
      for (const r of published.runs)
        await expect(page.locator(`a[href="${runPath(r.id)}"]`)).toBeVisible();
      expect(await sideways(page)).toBeLessThanOrEqual(0);
      expect(await axe(page)).toEqual([]);
    });

    for (const r of published.runs)
      test(`${runPath(r.id)} is axe clean and self-contained`, async ({ page, baseURL }) => {
        const outside: string[] = [];
        page.on('request', (req) => {
          const u = new URL(req.url());
          const own = u.origin === new URL(baseURL ?? '').origin;
          if (!own || !(u.pathname.startsWith(runPath(r.id)) || u.pathname === '/favicon.svg'))
            outside.push(req.url());
        });
        const res = await page.goto(runPath(r.id));
        expect(res?.status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(r.project);
        await expect(page).toHaveTitle(/Fitts run report/);
        await page.waitForLoadState('networkidle');
        expect(await sideways(page)).toBeLessThanOrEqual(0);
        expect(await axe(page)).toEqual([]);
        expect(outside).toEqual([]);
      });
  });

test('a run report links back to the list and home', async ({ page }) => {
  const r = published.runs[0];
  if (!r) return;
  await page.goto(runPath(r.id));
  await page.getByRole('link', { name: 'All runs' }).click();
  await expect(page).toHaveURL(/\/runs\/$/);
  await page.goto(runPath(r.id));
  await page.getByRole('link', { name: 'Fitts, home' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('a run address without its slash redirects to it; an unknown run is a 404', async ({
  page,
}) => {
  const r = published.runs[0];
  if (r) {
    await page.goto(runPath(r.id).slice(0, -1));
    await expect(page).toHaveURL(new RegExp(`${runPath(r.id)}$`));
  }
  const res = await page.goto('/runs/no-such-run/');
  expect(res?.status()).toBe(404);
});

test('Home, Showcase and Download link to real runs', async ({ page }) => {
  if (!featuredRun) return;
  for (const path of ['/', '/showcase/']) {
    await page.goto(path);
    await expect(page.locator(`main a[href="${runPath(featuredRun.id)}"]`).first()).toBeVisible();
  }
  // Try it without keys (the replay is gone): Download points at the list of runs.
  await page.goto('/download/');
  await expect(page.locator('main a[href="/runs/"]')).toBeVisible();
  await page.goto('/');
  await page.getByRole('link', { name: 'See a real run. No install, no keys.' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(featuredRun.project);
});

test('the sitemap lists /runs/ and each run', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).toContain('https://fitts.allenzheng.com/runs/</loc>');
  for (const r of published.runs)
    expect(xml).toContain(`https://fitts.allenzheng.com${runPath(r.id)}</loc>`);
});
