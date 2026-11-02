// Confirming a repro (SPEC-phase4 §5.2): replay the pruned steps on the hidden replayer and
// run the finding's oracle. Seen again → `confirmed: 'replayed'`, and ddmin shrinks the steps
// (one pass, ≤ 8 replays, U4b). If the pruned steps don't reproduce, the full trail is tried
// (and shrunk). Reviewer-only findings have no oracle: `observed`. Owner findings: `owner`.
import { feedbackTiming, type ActionTrace } from '@fitts/probes';
import type { Finding, Repro } from '@fitts/schema';
import { PAGE_PROBES, type PageProbeName } from '@fitts/probes';
import { problems } from '../review/aggregate';
import type { OpTrace, ReplayAnswer, ReplayAsk, ReplayStep } from '../protocol';
import type { TrailStep, Oracle } from './repro';
import { DDMIN_REPLAYS, ddmin, type Verdict } from './ddmin';

export type Replayer = (ask: ReplayAsk) => Promise<ReplayAnswer>;

/** Trail steps as the replayer takes them. */
export function replaySteps(trail: TrailStep[]): ReplayStep[] {
  return trail.flatMap((t): ReplayStep[] => {
    if (t.kind === 'navigate' || t.kind === 'load')
      return t.to ? [{ kind: 'navigate', path: t.to }] : [];
    if (t.kind === 'back') return [{ kind: 'back' }];
    if (t.kind === 'key') return [{ kind: 'key', text: t.text ?? 'Enter' }];
    return [
      {
        kind: t.kind,
        ...(t.ref ? { ref: t.ref } : {}),
        ...(t.target ? { target: t.target } : {}),
        ...(t.text ? { text: t.text } : {}),
      },
    ];
  });
}

const isPage = (p: string): p is PageProbeName => (PAGE_PROBES as readonly string[]).includes(p);

/** What the replayer must run for an oracle. */
export function askFor(
  oracle: Oracle,
  start: ReplayAsk['start'],
  steps: ReplayStep[],
  lastRef?: string,
): ReplayAsk {
  const base: ReplayAsk = { start, steps };
  if (oracle.kind === 'probe') {
    if (oracle.probe === 'focus-visible') return { ...base, probes: [], focus: true };
    if (oracle.probe === 'viewport-sweep') return { ...base, probes: [], viewport: true };
    return { ...base, probes: isPage(oracle.probe) ? [oracle.probe] : [...PAGE_PROBES] };
  }
  if (oracle.kind === 'trace' && oracle.probe === 'back-mid-flow')
    return { ...base, probes: [], ...(lastRef ? { fieldValueOf: lastRef } : {}) };
  return {
    ...base,
    probes:
      oracle.kind === 'trace' && oracle.probe === 'placeholder-leak' ? ['placeholder-leak'] : [],
  };
}

/** Whether the oracle saw the problem again in a replay's answer. */
export function seenAgain(
  oracle: Oracle,
  answer: ReplayAnswer,
  finding: Pick<Finding, 'elementRef'>,
): boolean {
  if (!answer.ok || oracle.kind === 'none') return false;
  if (oracle.kind === 'probe') {
    const items =
      oracle.probe === 'focus-visible'
        ? answer.focus
        : oracle.probe === 'viewport-sweep'
          ? answer.viewport
          : answer.results
              .filter((r) => r.probe === oracle.probe && !r.pass)
              .flatMap((r) => r.items);
    const keys = problems(oracle.probe, items);
    return keys.has(`${oracle.probe}|${oracle.title}`);
  }
  const last = [...answer.traces].reverse().find((t): t is OpTrace => t !== null);
  if (oracle.probe === 'feedback-timing') {
    if (!last) return false;
    const trace: ActionTrace = {
      ref: finding.elementRef ?? '',
      name: '',
      kind: 'click',
      feedback: last.feedback,
      navigated: false,
      requests: last.requests,
      ...(last.opened ? { opened: true } : {}),
    };
    return problems('feedback-timing', feedbackTiming(trace)).has(
      `feedback-timing|${oracle.title}`,
    );
  }
  if (oracle.probe === 'error-message')
    return (
      (last?.feedback?.errors ?? []).length > 0 ||
      answer.results.some((r) => r.probe === 'error-message' && !r.pass)
    );
  if (oracle.probe === 'placeholder-leak')
    return answer.results.some((r) => r.probe === 'placeholder-leak' && !r.pass);
  return false;
}

/**
 * Replays the pruned steps; if they don't reproduce, the whole trail once. Returns the repro
 * with `confirmed` set, and the steps that reproduced (for the Playwright test).
 */
export interface ConfirmOptions {
  /** SPEC-phase4 §5.2 step 3: shrink the reproducing steps with ddmin (default on). */
  ddmin?: boolean;
  /** Replays ddmin may use, on top of the confirmation replay. */
  cap?: number;
  /** Resolves when a replay may run (the run isn't paused for the models, §6C). */
  ready?: () => Promise<void>;
  /** The run ended: stop replaying. */
  stopped?: () => boolean;
}

/**
 * Replays the pruned steps; if they don't reproduce, the whole trail once. When a set
 * reproduces and has more than 2 steps, ddmin shrinks it (one pass, ≤ 8 replays), then the
 * shrunk steps are confirmed once more; if that fails, the set that reproduced is kept. Returns
 * `confirmed` and the steps that were seen to reproduce (for the repro and the Playwright test).
 */
export async function confirm(
  replayer: Replayer,
  oracle: Oracle,
  finding: Pick<Finding, 'elementRef' | 'owner'>,
  repro: Repro,
  pruned: TrailStep[],
  full: TrailStep[],
  start: ReplayAsk['start'],
  opts: ConfirmOptions = {},
): Promise<{ confirmed: Repro['confirmed']; steps: TrailStep[]; replays?: number }> {
  if (finding.owner) return { confirmed: 'owner', steps: pruned };
  if (oracle.kind === 'none') return { confirmed: 'observed', steps: pruned };
  let replays = 0;
  /** One replay with the finding's own oracle: seen, not seen, or stop (failed, or the run ended). */
  const reproduces = async (steps: TrailStep[]): Promise<Verdict> => {
    if (opts.stopped?.()) return 'stop';
    await opts.ready?.();
    if (opts.stopped?.()) return 'stop';
    replays += 1;
    let answer: ReplayAnswer;
    try {
      const lastRef = steps.find((t) => t.kind === 'type')?.ref;
      answer = await replayer(askFor(oracle, start, replaySteps(steps), lastRef));
    } catch {
      return 'stop';
    }
    if (oracle.kind === 'trace' && oracle.probe === 'back-mid-flow') {
      const typed = steps.find((t) => t.kind === 'type')?.text;
      return answer.ok &&
        typed !== undefined &&
        answer.value !== undefined &&
        answer.value !== typed
        ? 'seen'
        : 'not-seen';
    }
    return seenAgain(oracle, answer, finding) ? 'seen' : 'not-seen';
  };
  for (const [i, steps] of [pruned, full].entries()) {
    // The full trail only when it differs from the pruned steps (the same list is replayed once).
    if (i === 1 && full.length === pruned.length) break;
    const verdict = await reproduces(steps);
    if (verdict === 'stop') return { confirmed: 'observed', steps: pruned, replays };
    if (verdict === 'not-seen') continue;
    // Seen: shrink it, then confirm the shrunk steps once more.
    if (opts.ddmin === false || steps.length <= 2) return { confirmed: 'replayed', steps, replays };
    const shrunk = await ddmin(steps, reproduces, opts.cap ?? DDMIN_REPLAYS);
    if (shrunk.steps.length === steps.length) return { confirmed: 'replayed', steps, replays };
    const final = await reproduces(shrunk.steps);
    return final === 'seen'
      ? { confirmed: 'replayed', steps: shrunk.steps, replays }
      : { confirmed: 'replayed', steps, replays };
  }
  return { confirmed: 'observed', steps: pruned, replays };
}

export type { ReplayAnswer, ReplayAsk, ReplayStep };
