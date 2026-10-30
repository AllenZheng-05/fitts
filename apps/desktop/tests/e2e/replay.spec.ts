// Judge replay (SPEC-phase2 §12.3): with no keys at all, Welcome's "Watch a recorded run" plays
// the bundled demo/chat run at 4×, with its real step shots as the site view, and Stop jumps to
// the end of the recording.
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './helpers/launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(async () => {
  await launched.close();
});

test('a recorded run plays without keys, and Stop jumps to its end', async () => {
  const { page } = launched;
  await expect(page.getByRole('heading', { name: "Hi, I'm Fitts." })).toBeVisible();
  await page.getByRole('button', { name: 'Watch a recorded run' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Replay · 4×' })).toBeVisible();
  // The recorded interview, then the audit with real step shots as the site.
  await expect(page.getByRole('log', { name: 'Conversation with Fitts' })).toContainText(
    'A messaging app so my grandparents can text the family.',
  );
  const shot = page.locator('img[src^="fitts-asset://replay-demo-chat/"]').first();
  await expect(shot).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(300);
  // Stop ends playback at the recording's end: the run summary.
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(page.getByRole('heading', { name: 'Run summary' })).toBeVisible();
  await expect(page.getByText(/All done\. I verified \d+ fix/)).toBeVisible();
});
