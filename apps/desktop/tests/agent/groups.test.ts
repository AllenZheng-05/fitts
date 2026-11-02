// @vitest-environment node
// Root-cause grouping (SPEC-phase4 §7.5).
import type { Finding } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import { rootCauses } from '../../src/agent/fix/groups';

const f = (id: string, over: Partial<Finding> = {}): Finding => ({
  id,
  runId: 'r',
  severity: 2,
  lens: 'accessibility',
  title: 'Text is hard to read',
  finding: '',
  fix: '',
  route: '/',
  agreement: { agreeing: 0, total: 5, who: [] },
  evidence: [],
  stepIndex: 0,
  atMs: 0,
  status: 'open',
  lane: 'shown',
  ...over,
});
const src = (line: number) => ({ file: 'src/styles.css', line, confidence: 'plugin' as const });

describe('rootCauses', () => {
  it('the same source line first, then a shared token, then one problem across pages', () => {
    const groups = rootCauses(
      [
        f('a', { source: src(12), route: '/' }),
        f('b', { source: src(12), route: '/contacts' }),
        f('c', { fix: 'Darken --muted to #6b6b66', route: '/search' }),
        f('d', { evidence: ['color: var(--muted)'], route: '/settings' }),
        f('e', { title: 'Tap target is too small', route: '/' }),
        f('g', { title: 'Tap target is too small', route: '/compose' }),
        f('h', { title: 'Tap target is too small', route: '/compose', status: 'verified' }),
      ],
      (x) => x.title,
    );
    expect(groups).toEqual([
      { key: 'src/styles.css:12', kind: 'source', findingIds: ['a', 'b'] },
      { key: '--muted', kind: 'token', findingIds: ['c', 'd'] },
      { key: 'Tap target is too small', kind: 'problem', findingIds: ['e', 'g'] },
    ]);
  });

  it('one page’s twins, a model guess at the source and a lone finding make no group', () => {
    expect(
      rootCauses(
        [
          f('a', { title: 'Same', route: '/x' }),
          f('b', { title: 'Same', route: '/x' }),
          f('c', { source: { file: 'x.tsx', line: 1, confidence: 'model' } }),
          f('d', { source: { file: 'x.tsx', line: 1, confidence: 'model' }, title: 'Other' }),
        ],
        (x) => x.title,
      ),
    ).toEqual([]);
  });
});
