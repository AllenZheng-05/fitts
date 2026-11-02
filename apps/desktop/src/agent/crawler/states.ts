// Every state, not just every page (SPEC-phase4 §6B.3). A state is the route plus what a person
// can do and read there: the sorted role:name of its controls, the open dialogs and the headings.
// A new key is a new state; the reviewers see each route's first state plus up to five more,
// chosen so they see the ones most likely to hold problems. Pure.
import type { AxSnapshot } from '../protocol';
import { routeOf } from './coverage';

export interface PageState {
  key: string;
  route: string;
  /** How it was reached ("after tapping NEXT with the form empty"). */
  label: string;
  stepIndex: number;
  /** An 8×8 average hash of its screenshot, as 16 hex characters. */
  hash?: string;
  dialog?: boolean;
  error?: boolean;
  journey?: 'step' | 'end';
}

/** A small, stable string hash (FNV-1a, 32 bits, hex). */
export function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The state key: route + hash of the controls, the open dialogs and the headings. */
export function stateKey(snap: Pick<AxSnapshot, 'path' | 'nodes' | 'headings'>): string {
  const controls = snap.nodes
    .map((n) => `${n.role}:${n.name.trim().toLowerCase().replace(/\s+/g, ' ')}`)
    .sort()
    .join('|');
  const dialogs = snap.nodes
    .filter((n) => n.region === 'dialog')
    .map((n) => n.name)
    .sort()
    .join('|');
  return `${routeOf(snap.path)}#${fnv(`${controls}§${dialogs}§${snap.headings.join('|')}`)}`;
}

/** Differing bits between two average hashes (0–64). */
export function hashDistance(a?: string, b?: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let bits = 0;
  for (let i = 0; i < a.length; i += 8) {
    let x = (parseInt(a.slice(i, i + 8), 16) ^ parseInt(b.slice(i, i + 8), 16)) >>> 0;
    while (x) {
      bits += x & 1;
      x >>>= 1;
    }
  }
  return bits;
}

/** Two shots this close are the same picture: the second state isn't reviewed. */
export const SAME_PICTURE = 4;
/** Extra states per route beyond the first. */
export const EXTRA_PER_ROUTE = 5;
/** Reviewed states per run, by model profile. */
export const STATE_CAP = { quality: 40, economy: 20 } as const;

/**
 * The states the reviewers see: each route's first state, then per route up to five more in
 * this order: dialogs, error states, journey steps, journey ends, then the ones whose picture
 * differs most from those already chosen. Near-identical pictures are skipped; the run cap holds.
 */
export function chooseStates(states: PageState[], cap: number = STATE_CAP.quality): PageState[] {
  const chosen: PageState[] = [];
  const byRoute = new Map<string, PageState[]>();
  for (const s of states) byRoute.set(s.route, [...(byRoute.get(s.route) ?? []), s]);
  const nearChosen = (s: PageState) =>
    chosen.some((c) => c.route === s.route && hashDistance(c.hash, s.hash) <= SAME_PICTURE);
  for (const list of byRoute.values()) {
    const first = list[0];
    if (first && chosen.length < cap) chosen.push(first);
  }
  const rank = (s: PageState) =>
    s.dialog ? 0 : s.error ? 1 : s.journey === 'step' ? 2 : s.journey === 'end' ? 3 : 4;
  for (const list of byRoute.values()) {
    let extra = 0;
    const rest = list.slice(1);
    const ordered = [...rest].sort((a, b) => rank(a) - rank(b));
    const firstTier = ordered.filter((s) => rank(s) < 4);
    const others = ordered.filter((s) => rank(s) === 4);
    for (const s of firstTier) {
      if (extra >= EXTRA_PER_ROUTE || chosen.length >= cap) break;
      if (nearChosen(s)) continue;
      chosen.push(s);
      extra += 1;
    }
    // Then the most different pictures, one at a time.
    const pool = [...others];
    while (pool.length && extra < EXTRA_PER_ROUTE && chosen.length < cap) {
      pool.sort(
        (a, b) =>
          Math.min(
            ...chosen.filter((c) => c.route === b.route).map((c) => hashDistance(c.hash, b.hash)),
          ) -
          Math.min(
            ...chosen.filter((c) => c.route === a.route).map((c) => hashDistance(c.hash, a.hash)),
          ),
      );
      const next = pool.shift();
      if (!next || nearChosen(next)) continue;
      chosen.push(next);
      extra += 1;
    }
  }
  return chosen;
}
