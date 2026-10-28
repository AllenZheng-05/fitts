import { expect, type Page } from '@playwright/test';

/** Layout guard (SPEC §12): the window itself never scrolls. */
export async function expectNoWindowScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
  }));
  expect(m.scrollHeight, 'vertical window scroll').toBeLessThanOrEqual(m.innerHeight);
  expect(m.scrollWidth, 'horizontal window scroll').toBeLessThanOrEqual(m.innerWidth);
}

/**
 * Runs the layout guard at an exact viewport. Emulation keeps the size exact on any
 * monitor, including ones too small to hold a real 1440×900 window.
 */
export async function expectNoWindowScrollAt(
  page: Page,
  size: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(size);
  await expect
    .poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toEqual([size.width, size.height]);
  await expectNoWindowScroll(page);
}
