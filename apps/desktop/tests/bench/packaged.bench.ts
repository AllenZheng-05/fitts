// Smoke test of the packaged app (SPEC-phase2 Â§16): `pnpm dist:dir` first. It launches the
// unpacked Fitts.exe with a throwaway profile, and reaches Welcome.
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('the packaged app starts and reaches Welcome', async () => {
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
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
