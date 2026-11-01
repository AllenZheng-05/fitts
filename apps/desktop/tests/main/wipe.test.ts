// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { wipeUserData } from '../../src/main/wipe';

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('Delete all my data', () => {
  it('empties the user data folder, nested folders and all, and keeps the folder', () => {
    dir = mkdtempSync(join(tmpdir(), 'fitts-wipe-'));
    mkdirSync(join(dir, 'projects', 'p', 'runs', 'run-1'), { recursive: true });
    writeFileSync(join(dir, 'projects', 'p', 'runs', 'run-1', 'events.ndjson'), '{}');
    writeFileSync(join(dir, 'secrets.json'), '{}');
    mkdirSync(join(dir, 'Local Storage'));
    wipeUserData(dir);
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('does nothing when the folder is missing', () => {
    dir = join(tmpdir(), 'fitts-wipe-missing');
    expect(() => wipeUserData(dir)).not.toThrow();
  });
});
