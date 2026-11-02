// @vitest-environment node
// States (SPEC-phase4 §6B.3): keys and the reviewers' selection.
import { describe, expect, it } from 'vitest';
import {
  chooseStates,
  hashDistance,
  stateKey,
  type PageState,
} from '../../src/agent/crawler/states';
import type { AxNode } from '../../src/agent/protocol';

const snap = (path: string, nodes: AxNode[], headings: string[] = []) => ({
  path,
  nodes,
  headings,
});
const btn = (name: string, region?: string): AxNode => ({
  ref: name,
  role: 'button',
  name,
  ...(region ? { region } : {}),
});

describe('stateKey', () => {
  it('the same controls in any order, refs aside, are one state; a dialog or a heading makes another', () => {
    const a = stateKey(snap('/compose?x=1', [btn('NEXT'), btn('Grandma')], ['Compose']));
    const b = stateKey(
      snap('/compose', [{ ...btn('Grandma'), ref: 'e9' }, btn('next')], ['Compose']),
    );
    expect(a).toBe(b);
    expect(a.startsWith('/compose#')).toBe(true);
    expect(
      stateKey(
        snap('/compose', [btn('NEXT'), btn('Grandma'), btn('Close', 'dialog')], ['Compose']),
      ),
    ).not.toBe(a);
    expect(
      stateKey(snap('/compose', [btn('NEXT'), btn('Grandma')], ['Compose', 'Required'])),
    ).not.toBe(a);
  });
});

describe('hashDistance', () => {
  it('counts differing bits', () => {
    expect(hashDistance('ffff0000ffff0000', 'ffff0000ffff0000')).toBe(0);
    expect(hashDistance('ffff0000ffff0000', 'ffff0001ffff0000')).toBe(1);
    expect(hashDistance(undefined, 'ff')).toBe(64);
  });
});

describe('chooseStates', () => {
  const st = (route: string, key: string, over: Partial<PageState> = {}): PageState => ({
    key,
    route,
    label: key,
    stepIndex: 0,
    hash: '0000000000000000',
    ...over,
  });

  it('each route’s first state, then dialogs, errors, journey steps and ends, then the most different', () => {
    const chosen = chooseStates([
      st('/a', 'a0'),
      st('/a', 'plain', { hash: 'ff00000000000000' }),
      st('/a', 'end', { journey: 'end', hash: '00ff000000000000' }),
      st('/a', 'err', { error: true, hash: '0000ff0000000000' }),
      st('/a', 'dlg', { dialog: true, hash: '000000ff00000000' }),
      st('/b', 'b0'),
    ]);
    expect(chosen.map((s) => s.key)).toEqual(['a0', 'b0', 'dlg', 'err', 'end', 'plain']);
  });

  it('near-identical pictures are skipped, five extras per route at most, and the run cap holds', () => {
    const many = [
      st('/a', 'a0'),
      ...Array.from({ length: 9 }, (_, i) =>
        st('/a', `x${i}`, { dialog: true, hash: (i + 1).toString(16).padStart(2, '0').repeat(8) }),
      ),
    ];
    expect(chooseStates(many).length).toBe(1 + 5);
    expect(
      chooseStates([st('/a', 'a0'), st('/a', 'same', { dialog: true })]).map((s) => s.key),
    ).toEqual(['a0']);
    expect(chooseStates(many, 3)).toHaveLength(3);
  });
});
