// SPEC-phase3 §3: a link that leaves the site opens in a tab beside it, with a bar that says
// you're off the site; the site's tab is always there and can't be closed. No network: the
// "other site" is a server on this machine on another port (another origin).
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type LaunchedApp } from './helpers/launch';

const DEMO = resolve(__dirname, '../../../../demo/chat');
const PORT = '5192';
let launched: LaunchedApp;
let other: Server;
let otherPort = 0;

test.beforeEach(async () => {
  other = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>Elsewhere page</title><h1>Somewhere else</h1>');
  });
  await new Promise<void>((r) => other.listen(0, '127.0.0.1', () => r()));
  const address = other.address();
  otherPort = typeof address === 'object' && address ? address.port : 0;
  launched = await launchApp({ env: { FITTS_E2E_PICK_FOLDER: DEMO, FITTS_SITE_PORT: PORT } });
  await launched.page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async () => {
  await launched.close();
  other.close();
});

const canvas = (page: Page) => page.locator('[data-site-canvas] canvas');
const address = (page: Page) => page.getByLabel('Address');

test('a link off the site opens in a tab beside it; the site’s tab stays and can’t be closed', async () => {
  test.setTimeout(120_000);
  const { page, app } = launched;
  await page.getByLabel('Meta Model API key').fill('meta-key-12345');
  await expect(page.getByRole('status').filter({ hasText: 'Works' })).toBeVisible();
  await page.getByRole('button', { name: 'Browse' }).click();
  await page.getByRole('button', { name: 'Open my project' }).click();
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose`, { timeout: 60_000 });
  await expect
    .poll(() => canvas(page).evaluate((c: HTMLCanvasElement) => c.width), { timeout: 30_000 })
    .toBeGreaterThan(300);

  // A link out of the site, in its top-left corner (demo/chat has none of its own).
  await app.evaluate(
    async ({ BrowserWindow }, [port, otherPort]) => {
      const site = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes(`:${port}/`),
      );
      await site?.webContents.executeJavaScript(
        `(() => { const a = document.createElement('a'); a.href = 'http://127.0.0.1:${otherPort}/'; a.textContent = 'Elsewhere'; a.style.cssText = 'position:fixed;left:0;top:0;width:240px;height:90px;z-index:99999;display:block;background:#fc0'; document.body.append(a); })()`,
      );
    },
    [PORT, String(otherPort)],
  );
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + 20, box.y + 20);

  const tabs = page.getByRole('tablist', { name: 'Tabs' });
  await expect(tabs.getByRole('tab')).toHaveCount(2, { timeout: 20_000 });
  await expect(tabs.getByRole('tab', { name: 'Your site' })).toHaveAttribute(
    'aria-selected',
    'false',
  );
  await expect(tabs.getByRole('tab', { name: 'Elsewhere page' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(address(page)).toHaveValue(`127.0.0.1:${otherPort}/`);
  await expect(
    page.getByRole('status').filter({ hasText: `You’re on 127.0.0.1:${otherPort}, not your site` }),
  ).toBeVisible();
  // The site's tab has no close button.
  await expect(page.getByRole('button', { name: /^Close Your site/ })).toHaveCount(0);

  // Back to the site: its address comes back, and the bar goes.
  await page.getByRole('button', { name: 'Back to your site' }).click();
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose`);
  await expect(page.getByRole('status').filter({ hasText: 'not your site' })).toHaveCount(0);

  // Closing the other tab leaves just the site, with no strip.
  await page.getByRole('button', { name: 'Close Elsewhere page' }).click();
  await expect(tabs).toHaveCount(0);

  // A link that opens a new window does the same.
  await app.evaluate(
    async ({ BrowserWindow }, [port]) => {
      const site = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes(`:${port}/`),
      );
      await site?.webContents.executeJavaScript(
        `document.querySelector('a[href^="http://127.0.0.1"]').target = '_blank'`,
      );
    },
    [PORT],
  );
  await page.mouse.click(box.x + 20, box.y + 20);
  await expect(tabs.getByRole('tab', { name: 'Elsewhere page' })).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 20_000 },
  );
});

test('closing the app window quits Fitts, even with the site mirror running', async () => {
  test.setTimeout(120_000);
  const { page, app } = launched;
  await page.getByLabel('Meta Model API key').fill('meta-key-12345');
  await expect(page.getByRole('status').filter({ hasText: 'Works' })).toBeVisible();
  await page.getByRole('button', { name: 'Browse' }).click();
  await page.getByRole('button', { name: 'Open my project' }).click();
  await expect(address(page)).toHaveValue(`localhost:${PORT}/compose`, { timeout: 60_000 });
  // On a Mac the app stays running with no windows, as Mac apps do: there, closing the app
  // window must still close the site's hidden window with it.
  if (process.platform === 'darwin') {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.isOffscreen())
        ?.close();
    });
    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), {
        timeout: 20_000,
      })
      .toBe(0);
    return;
  }
  const quit = new Promise<void>((r) => app.process().once('exit', () => r()));
  // The site's window is open (hidden); closing the app window must still end the app.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => !w.webContents.isOffscreen())
      ?.close();
  });
  await expect(quit).resolves.toBeUndefined();
});
