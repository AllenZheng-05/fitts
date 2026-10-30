// Smoke test of the packaged app (SPEC-phase2 §16): `pnpm dist:dir` first. It launches the
// unpacked Fitts.exe with a throwaway profile, reaches Welcome, and plays the bundled replay
// with no keys.
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('the packaged app starts and plays the bundled replay without keys', async () => {
  test.setTimeout(120_000);
  const userData = mkdtempSync(join(tmpdir(), 'fitts-packaged-'));
  const env: Record<string, string> = { FITTS_USER_DATA: userData };
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] ??= v;
  const app = await electron.launch({
    executablePath: resolve(__dirname, '../../release/win-unpacked/Fitts.exe'),
    env,
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: "Hi, I'm Fitts." })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Watch a recorded run' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Replay · 4× speed' })).toBeVisible();
    await expect(page.locator('img[src^="fitts-asset://replay-demo-chat/"]').first()).toBeVisible({
      timeout: 60_000,
    });
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
