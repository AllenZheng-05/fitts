// /checks is built from the code. This holds the catalog to it: every probe is listed, each
// check's title and heuristic are the ones Fitts gives its findings, and the lists copied out of
// apps/desktop match their sources (SITE-DECISIONS, step 2).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAGE_PROBES, PROBE_STANDARDS, WCAG } from '@fitts/probes';
import type { ProbeName } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import { chooseCells } from '../../../desktop/src/agent/devices/matrix';
import { template } from '../../../desktop/src/agent/review/aggregate';
import { AXE_TAGS, BASE_CELLS, CATALOG, FIX_CHECK, GROUPS } from '../../src/content/catalog';

const repo = (p: string) => readFileSync(resolve(import.meta.dirname, '../../../..', p), 'utf8');

/** The quoted names in `const NAME = new Set<ProbeName>([ … ]);` (or an array), in order. */
function listIn(src: string, name: string): string[] {
  const start = src.indexOf(`const ${name} =`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const body =
    src
      .slice(start)
      .replace(/\/\/.*$/gm, '')
      .split(']')[0] ?? '';
  const spread = body.includes('...PAGE_PROBES') ? (PAGE_PROBES as string[]) : [];
  return [...spread, ...[...body.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '')];
}

describe('the checks catalog', () => {
  it('lists every probe Fitts has', () => {
    const listed = new Set(CATALOG.flatMap((c) => (c.probe ? [c.probe] : [])));
    for (const probe of Object.keys(PROBE_STANDARDS) as ProbeName[])
      expect(listed.has(probe), `${probe} is missing from /checks`).toBe(true);
  });

  it('uses the titles and heuristics Fitts gives its findings', () => {
    for (const c of CATALOG) {
      if (!c.probe || !c.sample) continue;
      const t = template(c.probe, { ref: '', selector: '', measured: c.sample, expected: '' });
      expect(c.title, c.id).toBe(t.title);
      expect(c.heuristic, c.id).toBe(t.heuristic);
    }
  });

  it('names only WCAG criteria Fitts knows, within its probe’s', () => {
    for (const c of CATALOG) {
      for (const sc of c.wcag ?? []) expect(WCAG[sc], `${c.id}: ${sc}`).toBeDefined();
      // A narrower list must come from the probe's own (the keyboard sweep reports 2.4.1 and
      // 2.4.11 through axe's tags as well, so those two are allowed for it).
      if (c.probe && c.wcag && c.probe !== 'keyboard')
        for (const sc of c.wcag) expect(PROBE_STANDARDS[c.probe] ?? []).toContain(sc);
    }
  });

  it('puts every check in a group, with unique ids', () => {
    const groups = new Set(GROUPS.map((g) => g.id));
    for (const c of CATALOG) expect(groups.has(c.group), c.id).toBe(true);
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
  });

  it('says how fixes are checked as the fix pipeline does', () => {
    const src = repo('apps/desktop/src/agent/fix/pipeline.ts');
    expect(FIX_CHECK.measured).toEqual(listIn(src, 'VERIFIABLE'));
    expect(FIX_CHECK.recheck).toEqual(listIn(src, 'RECHECKED'));
    expect(FIX_CHECK.replay).toEqual(listIn(src, 'TRACE'));
  });

  it('runs axe with the tags the page probe uses', () => {
    expect(AXE_TAGS).toEqual(listIn(repo('packages/probes/src/page.ts'), 'AXE_TAGS'));
  });

  it('lists the screen-size cells every run starts from', () => {
    expect(BASE_CELLS).toEqual(chooseCells({ breakpoints: [] }).map((c) => c.label));
  });

  it('uses Android’s 48 dp minimum, as the probe does', () => {
    expect(repo('packages/probes/src/android.ts')).toMatch(/const MIN_DP = 48;/);
  });
});
