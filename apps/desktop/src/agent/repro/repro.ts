// Findings anyone can reproduce (SPEC-phase4 §5): the minimal steps from the crawl's trail
// (navigation-aware pruning), expected vs actual, the environment, the standard it's about, and
// the Playwright test. Pure: the replay that confirms the steps lives in replay.ts.
import type { AppModel, DeviceCell, Finding, ProbeItem, ProbeName, Repro } from '@fitts/schema';
import { probeStandards, axeStandards, axeRuleUrl } from '@fitts/probes';
import { routeOf } from '../crawler/coverage';
import { playwrightTest } from './playwright';

/** One step Fitts took, as the trail records it (run.ts), with what it touched. */
export interface TrailStep {
  step: number;
  route: string;
  ref?: string;
  label: string;
  kind: 'click' | 'type' | 'navigate' | 'back' | 'key' | 'load';
  /** The control's role and accessible name, and its test id when it has one. */
  target?: { role: string; name: string; testId?: string };
  /** What was typed (type steps). */
  text?: string;
  /** Where it went, when it navigated. */
  to?: string;
  /** How long the page took to respond (SPEC §6A), when measured. */
  ms?: number | null;
}

/** The oracle a replay checks (§5.2): a probe's item, or a trace check. */
export type Oracle =
  | { kind: 'probe'; probe: ProbeName; title: string; ref?: string }
  | {
      kind: 'trace';
      probe:
        | 'feedback-timing'
        | 'back-mid-flow'
        | 'error-message'
        | 'placeholder-leak'
        | 'label-consistency';
      title: string;
      ref?: string;
    }
  | { kind: 'none' };

/** Steps that reach a route in one go: a direct load is the shortest start (§5.2 step 1). */
export function loadsDirectly(route: string, model: AppModel | undefined): boolean {
  const page = model?.pages.find((p) => p.route === route);
  if (!page) return true;
  return !page.gate && !page.dynamic;
}

/** The last navigation (or load) onto `route` in the trail, by index. */
function lastArrival(trail: TrailStep[], route: string): number {
  for (let i = trail.length - 1; i >= 0; i--) {
    const t = trail[i];
    if (!t) continue;
    if ((t.kind === 'navigate' || t.kind === 'load') && routeOf(t.to ?? t.route) === route)
      return i;
    if (t.to && routeOf(t.to) === route && t.route !== route) return i;
  }
  return -1;
}

/**
 * Pruning (§5.2 step 1): from the last arrival on the finding's route when it loads directly
 * (else from the start of the flow that reaches it); drop steps on other pages before that;
 * on the page itself keep what touched the finding's element, typed into a field, or moved
 * on. The finding's own step (when it has one) is the last.
 */
export function pruneTrail(
  trail: TrailStep[],
  finding: Pick<Finding, 'route' | 'elementRef' | 'stepIndex'>,
  model?: AppModel,
): TrailStep[] {
  const route = finding.route;
  const upTo = trail.filter(
    (t) => t.step <= Math.max(finding.stepIndex, 0) || finding.stepIndex === 0,
  );
  const list = upTo.length ? upTo : trail;
  let from = 0;
  // In the gated case, the index of the arrival: everything up to it is the flow.
  let flow = -1;
  if (loadsDirectly(route, model)) {
    const i = lastArrival(list, route);
    // The arrival itself is replaced by the start URL: steps begin after it.
    from = i >= 0 ? i + 1 : list.findIndex((t) => t.route === route);
    if (from < 0) from = 0;
  } else {
    // A gated or data-dependent page: keep the whole visit to the page it was reached from
    // (what was picked or typed there is what the page needs), then the arrival.
    const i = lastArrival(list, route);
    if (i >= 0) {
      const prev = list[i]!.route;
      let j = i;
      while (j > 0 && list[j - 1]!.route === prev && list[j - 1]!.kind !== 'load') j -= 1;
      from = j;
      flow = i;
    }
  }
  const kept = list.slice(from).filter((t, k) => {
    if (t.route !== route)
      return k + from <= flow || (t.to !== undefined && routeOf(t.to) === route);
    if (finding.elementRef && t.ref === finding.elementRef) return true;
    if (t.kind === 'type') return true;
    if (t.to !== undefined && routeOf(t.to) !== route) return false;
    if (t.kind === 'click' && t.step === finding.stepIndex) return true;
    // A click that didn't touch the element and didn't move on: not needed.
    return false;
  });
  return kept;
}

/** "Tap **NEXT**", "Type anything in **Message**", "Go back with the browser's Back button". */
export function stepText(t: TrailStep): string {
  const name = t.target?.name?.trim() || t.ref || 'it';
  switch (t.kind) {
    case 'navigate':
    case 'load':
      return `Open ${t.to ?? t.route}`;
    case 'type':
      return t.text
        ? `Type “${t.text.slice(0, 40)}” in **${name}**`
        : `Type anything in **${name}**`;
    case 'back':
      return 'Go back with the browser’s Back button';
    case 'key':
      return `Press ${t.text ?? 'Enter'}`;
    default: {
      const wait = t.ms && t.ms > 1500 ? ` (then wait about ${Math.round(t.ms / 500) / 2} s)` : '';
      return `Tap **${name}**${wait}`;
    }
  }
}

/** The environment line: browser, size, touch, scheme, zoom. */
export function environment(
  cell: DeviceCell | undefined,
  userAgent: string,
  size?: { width: number; height: number },
): string {
  const chrome = /Chrome\/(\d+)/.exec(userAgent)?.[1];
  const w = cell?.width ?? size?.width;
  const h = cell?.height ?? size?.height;
  return [
    chrome ? `Chromium ${chrome}` : 'Chromium',
    w && h ? `${w}×${h}` : 'desktop size',
    cell?.touch ? 'touch' : 'mouse',
    cell?.scheme ?? 'light',
    `${Math.round((cell?.zoom ?? 1) * 100)}%`,
    ...(cell?.textSpacing ? ['text spacing'] : []),
    ...(cell?.motion === 'reduce' ? ['reduced motion'] : []),
  ].join(' · ');
}

export interface ReproInput {
  finding: Finding;
  trail: TrailStep[];
  origin: string;
  /** The device cell the finding was seen on, when not the default. */
  cell?: DeviceCell;
  userAgent: string;
  size?: { width: number; height: number };
  /** The probe item the finding came from (expected and measured). */
  item?: ProbeItem;
  probe?: ProbeName;
  /** The reviewer's own expected/actual/steps, when the draft gave them. */
  draft?: { expected?: string; actual?: string; steps?: string[] };
  /** An axe violation's rule id, tags and help URL. */
  axe?: { id: string; tags: string[]; helpUrl?: string };
  model?: AppModel;
}

/** The repro before replay: steps, expected/actual, environment, standards, the test. */
export function buildRepro(input: ReproInput): Repro {
  const { finding, origin, cell, item, probe, draft } = input;
  const pruned = pruneTrail(input.trail, finding, input.model);
  const steps: Repro['steps'] = pruned.map((t, i) => ({
    n: i + 1,
    text: stepText(t),
    route: t.route,
    ...(t.target ? { target: t.target } : {}),
    shot: t.step,
  }));
  if (steps.length === 0 && draft?.steps?.length)
    steps.push(
      ...draft.steps.slice(0, 10).map((text, i) => ({ n: i + 1, text, route: finding.route })),
    );
  const expected = item?.expected ? capitalize(item.expected) : (draft?.expected ?? '');
  const actual = item?.measured ? capitalize(item.measured) : (draft?.actual ?? finding.finding);
  const wcag = [
    ...(probe ? probeStandards(probe) : []),
    ...(input.axe ? axeStandards(input.axe.tags) : []),
  ].filter((c, i, all) => all.findIndex((x) => x.sc === c.sc) === i);
  const repro: Repro = {
    start: {
      url: new URL(finding.route, origin).toString(),
      device: cell?.id ?? 'desktop',
    },
    steps,
    expected,
    actual,
    environment: environment(cell, input.userAgent, input.size),
    confirmed: finding.owner ? 'owner' : 'observed',
    ...(wcag.length ? { wcag: wcag.map(({ sc, name, url }) => ({ sc, name, url })) } : {}),
    ...(input.axe
      ? { rule: { id: input.axe.id, url: axeRuleUrl(input.axe.id, input.axe.helpUrl) } }
      : {}),
  };
  repro.playwright = playwrightTest(finding, repro, { probe, item, cell });
  return repro;
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** The oracle for a finding: its probe (and item), else a trace check, else none. */
export function oracleFor(
  finding: Finding,
  check: { probe: ProbeName; title: string } | undefined,
): Oracle {
  if (!check) return { kind: 'none' };
  const trace: Oracle['kind'] extends never ? never : string[] = [
    'feedback-timing',
    'back-mid-flow',
    'error-message',
    'label-consistency',
  ];
  if (trace.includes(check.probe))
    return {
      kind: 'trace',
      probe: check.probe as 'feedback-timing',
      title: check.title,
      ...(finding.elementRef ? { ref: finding.elementRef } : {}),
    };
  return {
    kind: 'probe',
    probe: check.probe,
    title: check.title,
    ...(finding.elementRef ? { ref: finding.elementRef } : {}),
  };
}
