// Abilities and the decider (SPEC-phase3 §1.1, §1.2). The run's stages are abilities; between
// them a decider picks the next one from what the run knows. The guarantees stay inside the
// abilities (§1.6), so a decider can choose badly but never unsafely.

export type AbilityName =
  | 'explore'
  /** SPEC-phase4 §6.1: one of the App Model's journeys, end to end. */
  | 'journey'
  /** SPEC-phase4 §6.3: every explored page at every cell of the device matrix (was phone_pass). */
  | 'device_pass'
  | 'check_links'
  | 'review'
  | 'check_theme'
  | 'looks'
  | 'fix'
  /** SPEC-phase4 §4.1: proposes the end; only the owner ends a run. */
  | 'propose_finish'
  /** SPEC-phase4 §4.2: the owner says something is a problem. */
  | 'report_issue'
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
  /** `journey`: which one; empty for the next planned. */
  journeyId?: string;
  /** `skip_pages`: the pages the owner wants skipped. */
  paths?: string[];
  /** `new_look`: what the owner wants; `revise_looks`: what they said about the looks. */
  wish?: string;
  /** `dismiss`, `report_issue`: the element the owner pointed at. */
  ref?: string;
  /** `report_issue`: the owner's words, and the page they mean. */
  text?: string;
  /** SPEC-phase4 §6A: one short line on why this ability, for the "Every detail" log. */
  why?: string;
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
  /** SPEC-phase4 §3: what the code says the app is, when Fitts read it. */
  app?: { summary: string; pages: string[]; journeys: string[] };
  /** SPEC-phase4 §4.3: what the owner told Fitts on earlier runs, in one line. */
  memory?: string;
  /** SPEC-phase4 §6A.4: what Fitts noticed so far: counts by kind, the latest lines. */
  noticed?: { byKind: Record<string, number>; latest: string[] };
  /** SPEC-phase4 §6.1: the App Model's journeys and how far each got. */
  journeys?: {
    id: string;
    name: string;
    priority: 1 | 2 | 3;
    status: 'planned' | 'running' | 'done' | 'failed' | 'blocked';
  }[];
}

export interface Decider {
  next(situation: Situation, signal?: AbortSignal): Promise<Decision>;
}

/**
 * Phase 2's order, as a decider (§1.2's fallback), with SPEC-phase4 §6.1's journeys: priority 1
 * and 2 journeys first, explore until the crawl ends, priority 3 journeys while the budget has
 * room, then the device pass, links, the review, the theme, a look if there is one, fixes, and
 * the finish proposal.
 */
export class ScriptedDecider implements Decider {
  next(s: Situation): Promise<Decision> {
    return Promise.resolve({ ability: scriptedNext(s) });
  }
}

export function scriptedNext(s: Situation): AbilityName {
  const planned = (ok: (priority: number) => boolean) =>
    s.journeys?.some((j) => j.status === 'planned' && ok(j.priority)) ?? false;
  if (planned((p) => p <= 2)) return 'journey';
  if (!s.coverage.ended) return 'explore';
  if (planned((p) => p === 3) && s.budget.spentUsd < s.budget.capUsd * 0.5) return 'journey';
  const order: AbilityName[] = ['device_pass', 'check_links', 'review', 'check_theme'];
  for (const a of order) if (!s.ran[a]) return a;
  if (!s.live && !s.ran.looks) return 'looks';
  if (!s.live && !s.ran.fix) return 'fix';
  return 'propose_finish';
}
