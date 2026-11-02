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
  changes: [],
  recent: [],
  messages: [],
  earlier: [],
  budget: { spentUsd: 0, capUsd: 20 },
  ...over,
});

describe('ScriptedDecider: Phase 2’s order (SPEC-phase3 §1.2)', () => {
  it('explores until the crawl ends, then phone, links, review, theme, looks, fix, then proposes finishing', () => {
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
      'device_pass',
      'check_links',
      'review',
      'check_theme',
      'looks',
      'fix',
      'propose_finish',
      'propose_finish',
    ]);
  });

  it('a live site skips looks and fixes', () => {
    const ran: Situation['ran'] = {
      device_pass: true,
      check_links: true,
      review: true,
      check_theme: true,
    };
    expect(
      scriptedNext(base({ live: true, coverage: { ...base().coverage, ended: true }, ran })),
    ).toBe('propose_finish');
  });
});

describe('SPEC-phase4 §6.1: journeys in the scripted order', () => {
  const journeys = (
    ...list: { id: string; priority: 1 | 2 | 3; status?: 'planned' | 'done' | 'failed' }[]
  ) =>
    list.map((j) => ({
      id: j.id,
      name: j.id,
      priority: j.priority,
      status: j.status ?? ('planned' as const),
    }));

  it('runs priority 1 and 2 journeys before exploring, and priority 3 after the crawl', () => {
    expect(scriptedNext(base({ journeys: journeys({ id: 'a', priority: 1 }) }))).toBe('journey');
    expect(scriptedNext(base({ journeys: journeys({ id: 'b', priority: 2 }) }))).toBe('journey');
    expect(scriptedNext(base({ journeys: journeys({ id: 'c', priority: 3 }) }))).toBe('explore');
    const ended = { ...base().coverage, ended: true };
    expect(
      scriptedNext(base({ coverage: ended, journeys: journeys({ id: 'c', priority: 3 }) })),
    ).toBe('journey');
    // Once they're done (or failed), the order carries on.
    expect(
      scriptedNext(base({ journeys: journeys({ id: 'a', priority: 1, status: 'done' }) })),
    ).toBe('explore');
    expect(
      scriptedNext(
        base({ coverage: ended, journeys: journeys({ id: 'a', priority: 1, status: 'failed' }) }),
      ),
    ).toBe('device_pass');
  });

  it('leaves priority 3 journeys when the budget is half spent', () => {
    const ended = { ...base().coverage, ended: true };
    expect(
      scriptedNext(
        base({
          coverage: ended,
          journeys: journeys({ id: 'c', priority: 3 }),
          budget: { spentUsd: 12, capUsd: 20 },
        }),
      ),
    ).toBe('device_pass');
  });
});
