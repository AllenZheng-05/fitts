// Published runs (public/runs/<id>/) are written by @fitts/run-report. Each is scanned again
// here, so a report with a key or a local path in it can't be deployed, and runs.json must list
// exactly the folders that exist.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanDir } from '@fitts/run-report';
import { describe, expect, it } from 'vitest';
import { featuredRun, published } from '../../src/content/runs';

const runs = resolve(import.meta.dirname, '../../public/runs');
const folders = existsSync(runs) ? readdirSync(runs) : [];

describe('published runs', () => {
  it('runs.json lists exactly the published folders, and features one of them', () => {
    expect(published.runs.map((r) => r.id).sort()).toEqual([...folders].sort());
    expect(featuredRun).toBeDefined();
  });

  for (const id of folders)
    it(`${id} has no keys, tokens or local paths`, () => {
      expect(scanDir(resolve(runs, id))).toEqual([]);
      const html = readFileSync(resolve(runs, id, 'index.html'), 'utf8');
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/\ssrc="https?:/);
    });
});
