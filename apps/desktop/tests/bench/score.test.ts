// @vitest-environment node
import type { Finding } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import { PLANTED, score } from './planted';

const finding = (over: Partial<Finding>): Finding => ({
  id: `f-${Math.random()}`,
  runId: 'run-1',
  severity: 2,
  lens: 'usability',
  title: 'Problem',
  finding: '',
  fix: '',
  route: '/',
  agreement: { agreeing: 1, total: 5, who: ['Probe'] },
  evidence: [],
  stepIndex: 0,
  atMs: 0,
  status: 'open',
  lane: 'shown',
  ...over,
});

describe('bench:chat scoring', () => {
  it('lists all 25 planted issues', () => {
    expect(PLANTED.map((p) => p.n)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it('matches by place and problem; one finding per issue; counts false positives at severity ≥ 2', () => {
    const s = score([
      finding({
        title: 'Placeholder text is too faint to read',
        route: '/compose/recipient',
        elementRef: 'compose-body',
      }),
      finding({ title: 'Text is too faint to read', route: '/' }),
      finding({ title: 'Too many font families', route: '/search' }),
      // Same place as #1 and #6, but neither problem: a false positive.
      finding({ title: 'Big heading wastes space', route: '/compose/recipient', severity: 2 }),
      // Severity 1 doesn't count against precision.
      finding({ title: 'Slow to show the main content', severity: 1, route: '/settings' }),
      // Suggestions aren't scored.
      finding({ title: 'Dates use three formats', route: '/search', lane: 'suggestion' }),
    ]);
    expect(s.matched.map((m) => m.planted.n).sort((a, b) => a - b)).toEqual([8, 9, 19]);
    expect(s.falsePositives.map((f) => f.title)).toEqual(['Big heading wastes space']);
    expect(s.suggestions).toBe(1);
  });

  it('reassigns a finding when another one fits only that issue (maximum matching)', () => {
    // "Faint placeholder" fits #8 only; "low contrast" on the recipient page could be #8 too,
    // but #9 is on "/": so only one of them counts.
    const s = score([
      finding({
        title: 'Recipient shows (null)',
        route: '/compose/recipient',
        elementRef: 'compose-to',
      }),
      finding({
        title: 'Recipient you picked isn’t shown',
        route: '/compose/recipient',
        elementRef: 'compose-to',
      }),
    ]);
    expect(s.matched.map((m) => m.planted.n).sort((a, b) => a - b)).toEqual([1, 6]);
  });
});
