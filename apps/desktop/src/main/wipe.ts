// "Delete all my data" (Settings › General): everything Fitts keeps in its user data folder goes,
// so the next start is a first launch. Run at startup, before anything opens a file there; the
// previous instance may still be letting go of files, so each removal retries for a while.
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const WIPE_FLAG = '--fitts-delete-all-data';

export function wipeUserData(dir: string): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    try {
      rmSync(join(dir, name), { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
    } catch {
      // A file still held keeps its folder; everything else is gone.
    }
  }
}
