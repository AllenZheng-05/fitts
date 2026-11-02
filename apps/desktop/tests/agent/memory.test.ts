// @vitest-environment node
// Project memory (SPEC-phase4 §4.3): rules from dismissals, how they match later findings, the
// owner-ok lane, and what the decider and reviewers are told.
import type { Finding, ProjectMemory } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import {
  applyRules,
  matches,
  memoryForReviewers,
  memoryLine,
  ruleFor,
  titleKeyOf,
} from '../../src/agent/memory/rules';

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'run-1-f1',
  runId: 'run-1',
  severity: 2,
  lens: 'accessibility',
  title: 'Text is too faint to read',
  finding: 'Some text has 2.6:1 contrast.',
  fix: 'Darken it.',
  route: '/',
  agreement: { agreeing: 0, total: 5, who: [], measured: true },
  evidence: [],
  stepIndex: 1,
  atMs: 0,
  status: 'open',
  lane: 'shown',
  ...over,
});

describe('rules from the owner', () => {
  it('a dismissal of a site-wide finding matches by probe and title anywhere', () => {
    const rule = ruleFor('not-a-problem', finding(), 'contrast', 'Intentional', 'run-1');
    expect(rule.id).toBe('not-a-problem:contrast|text is too faint to read');
    expect(rule.match).toEqual({
      probe: 'contrast',
      titleKey: 'contrast|text is too faint to read',
    });
    expect(matches(rule, finding({ route: '/settings' }), 'contrast')).toBe(true);
    expect(matches(rule, finding({ title: 'Tap target is too small' }), 'target-size')).toBe(false);
  });

  it('a dismissal of one element’s finding stays on that page and file', () => {
    const f = finding({
      elementRef: 'stamp',
      source: { file: 'src/Inbox.tsx', line: 3, confidence: 'plugin' },
    });
    const rule = ruleFor('not-a-problem', f, 'contrast', 'Won’t fix', 'run-1');
    expect(rule.match).toEqual({
      probe: 'contrast',
      titleKey: 'contrast|text is too faint to read',
      route: '/',
      src: 'src/Inbox.tsx',
    });
    expect(matches(rule, f, 'contrast')).toBe(true);
    expect(matches(rule, finding({ ...f, route: '/settings' }), 'contrast')).toBe(false);
    expect(
      matches(
        rule,
        finding({ ...f, locations: [{ route: '/', stepIndex: 1 }], route: '/x' }),
        'contrast',
      ),
    ).toBe(true);
    expect(
      matches(
        rule,
        finding({ ...f, source: { file: 'src/Other.tsx', line: 1, confidence: 'search' } }),
        'contrast',
      ),
    ).toBe(false);
  });

  it('reviewer findings match on their title alone', () => {
    const f = finding({
      title: 'Settings has too many toggles',
      agreement: { agreeing: 3, total: 5, who: ['a', 'b', 'c'] },
    });
    const rule = ruleFor('not-a-problem', f, undefined, 'Not a problem for my audience', 'run-1');
    expect(titleKeyOf(f)).toBe('|settings has too many toggles');
    expect(
      matches(
        rule,
        finding({ title: 'Settings has too many toggles', route: '/settings' }),
        undefined,
      ),
    ).toBe(true);
  });
});

describe('applying them (§14: never posted, pinned or fixed)', () => {
  const memory: ProjectMemory = {
    rules: [
      ruleFor('not-a-problem', finding(), 'contrast', 'Intentional', 'run-1'),
      ruleFor(
        'severity',
        finding({ title: 'Tap target is too small' }),
        'target-size',
        'This matters more',
        'run-1',
        1,
      ),
    ],
    likes: ['the teal'],
    dislikes: ['Nothing cutesy'],
  };
  it('moves matching findings to owner-ok with the reason, shifts severities, leaves the rest', () => {
    const out = applyRules(
      [
        finding(),
        finding({ id: 'f2', title: 'Tap target is too small', severity: 2 }),
        finding({ id: 'f3', title: 'No confirmation after sending' }),
      ],
      memory,
      (f) =>
        f.title.includes('faint')
          ? 'contrast'
          : f.title.includes('target')
            ? 'target-size'
            : undefined,
    );
    expect(out[0]).toMatchObject({ lane: 'owner-ok', ownerReason: 'Intentional' });
    expect(out[1]).toMatchObject({ lane: 'shown', severity: 3 });
    expect(out[2]).toMatchObject({ lane: 'shown' });
    expect(applyRules([finding()], undefined, () => 'contrast')[0]?.lane).toBe('shown');
  });

  it('says what it remembers, in one line, and calibrates the reviewers', () => {
    expect(memoryLine(memory)).toBe('1 thing you said isn’t a problem, 1 like, 1 dislike');
    expect(memoryLine({ rules: [], likes: [], dislikes: [] })).toBeUndefined();
    const lines = memoryForReviewers(memory);
    expect(lines[0]).toContain('not problems here');
    expect(lines[0]).toContain('“text is too faint to read” (Intentional)');
    expect(lines).toContain('The owner likes: the teal.');
    expect(lines).toContain("The owner doesn't want: Nothing cutesy.");
  });
});
