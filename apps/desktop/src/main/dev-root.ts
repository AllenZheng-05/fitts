// Dev builds only: the monorepo root (where .env.local and .fitts-dev/ live), found by walking up
// from the app's path to pnpm-workspace.yaml. `pnpm dev` and the e2e harness start the app from
// different folders, so a fixed number of `..` doesn't work. Never used in packaged builds.
import { app } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function devRepoRoot(): string | undefined {
  if (app.isPackaged) return undefined;
  let dir = app.getAppPath();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}
