// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { scriptedNext, type Situation } from '../../src/agent/orchestrator/abilities';

const base = (over: Partial<Situation> = {}): Situation => ({
  brief: {},
  mode: 'ask-unsure',
  live: false,
  coverage: { complete: false, ended: false, controls: { done: 0, total: 0 }, routes: [] },
  stalled: 0,
  findings: { total: 0, bySeverity: {}, worst: [] },
  ran: {},
  recent: [],
  messages: [],
  earlier: [],
  budget: { spentUsd: 0, capUsd: 20 },
  ...over,
});

describe('ScriptedDecider: Phase 2’s order (SPEC-phase3 §1.2)', () => {
  it('explores until the crawl ends, then phone, links, review, theme, looks, fix, finish', () => {
    expect(scriptedNext(base())).toBe('explore');
    const ended = { ...base().coverage, ended: true };
    const seq: string[] = [];
    const ran: Situation['ran'] = {};
    for (let i = 0; i < 8; i++) {
      const next = scriptedNext(base({ coverage: ended, ran }));
      seq.push(next);
      ran[next] = true;
    }
    expect(seq).toEqual([
      'phone_pass',
      'check_links',
      'review',
      'check_theme',
      'looks',
      'fix',
      'finish',
      'finish',
    ]);
  });

  it('a live site skips looks and fixes', () => {
    const ran: Situation['ran'] = {
      phone_pass: true,
      check_links: true,
      review: true,
      check_theme: true,
    };
    expect(
      scriptedNext(base({ live: true, coverage: { ...base().coverage, ended: true }, ran })),
    ).toBe('finish');
  });
});
