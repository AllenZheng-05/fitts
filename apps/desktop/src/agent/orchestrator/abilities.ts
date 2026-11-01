// Abilities and the decider (SPEC-phase3 §1.1, §1.2). The run's stages are abilities; between
// them a decider picks the next one from what the run knows. The guarantees stay inside the
// abilities (§1.6), so a decider can choose badly but never unsafely.

export type AbilityName =
  | 'explore'
  | 'phone_pass'
  | 'check_links'
  | 'review'
  | 'check_theme'
  | 'looks'
  | 'fix'
  | 'finish'
  // The owner's pivots (§1.4).
  | 'skip_pages'
  | 'stop_exploring'
  | 'new_look'
  | 'revise_looks'
  | 'dismiss'
  // A rolled-back fix, tried again with a hint (once per finding, §1.6).
  | 'retry_fix';

export interface Decision {
  ability: AbilityName;
  /** `explore`: the page to go to first. */
  route?: string;
  /** `skip_pages`: the pages the owner wants skipped. */
  paths?: string[];
  /** `new_look`: what the owner wants; `revise_looks`: what they said about the looks. */
  wish?: string;
  /** `dismiss`: the element the owner pointed at. */
  ref?: string;
  /** `retry_fix`: the finding whose fix was rolled back, and what to do differently. */
  findingId?: string;
  hint?: string;
  /** A line Fitts says as it starts (§1.3): why it chose this, when that's worth saying. */
  say?: string;
}

/** What an ability did, for the next decision. `refused`: a guarantee said no (with why). */
export interface Outcome {
  ability: AbilityName;
  result: 'done' | 'progress' | 'refused' | 'nothing';
  note?: string;
}

/** What the decider sees (§1.2). Built fresh before every decision. */
export interface Situation {
  brief: Record<string, unknown>;
  mode: string;
  /** No code: no `fix`, no `looks` (§1.6). */
  live: boolean;
  coverage: {
    complete: boolean;
    /** The crawl can't usefully go on: complete, going in circles, or at the ceiling. */
    ended: boolean;
    controls: { done: number; total: number };
    routes: { path: string; status: string; label?: string }[];
    nextRoute?: string;
  };
  /** Steps in a row that moved nothing (§1.5). */
  stalled: number;
  findings: { total: number; bySeverity: Record<number, number>; worst: string[] };
  /** Which abilities have already run to the end (each of these runs once). */
  ran: Partial<Record<AbilityName, boolean>>;
  /** The last changes (newest last): verified, rolled back with why, undone. */
  changes: {
    id: string;
    findingId?: string;
    title: string;
    status: 'verified' | 'rolled-back' | 'undone' | 'retrying';
    reason?: string;
    /** Fixer passes so far: the first, plus repairs after a failed check. */
    attempts?: number;
  }[];
  /** The last abilities and their outcomes, newest last. */
  recent: Outcome[];
  /** The owner's messages since the last decision, oldest first. */
  messages: string[];
  /** The ten before those. */
  earlier: string[];
  budget: { spentUsd: number; capUsd: number };
}

export interface Decider {
  next(situation: Situation, signal?: AbortSignal): Promise<Decision>;
}

/**
 * Phase 2's order, as a decider (§1.2's fallback): explore until the crawl ends, then the phone
 * pass, links, the review, the theme, a look if there is one, fixes, and finish.
 */
export class ScriptedDecider implements Decider {
  next(s: Situation): Promise<Decision> {
    return Promise.resolve({ ability: scriptedNext(s) });
  }
}

export function scriptedNext(s: Situation): AbilityName {
  if (!s.coverage.ended) return 'explore';
  const order: AbilityName[] = ['phone_pass', 'check_links', 'review', 'check_theme'];
  for (const a of order) if (!s.ran[a]) return a;
  if (!s.live && !s.ran.looks) return 'looks';
  if (!s.live && !s.ran.fix) return 'fix';
  return 'finish';
}
