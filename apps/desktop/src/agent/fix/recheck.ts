// Navigation and keyboard findings, verified on the fix's worktree (Allen, Nov 2): the finding's
// own check runs again on the worktree's dev server through the replayer (a fresh load and a
// reload for "refresh breaks it", the made-up address for the soft 404, the click and its
// expected destination for a wrong destination; the Tab sweep, or the dialog checks after the
// steps that opened it), and the same pure checks the crawl used judge what it measured. Pure.
import {
  dialogProblems,
  keyboardKind,
  keyboardProblems,
  PAGE_PROBES,
  type PageProbeName,
} from '@fitts/probes';
import type { ProbeItem } from '@fitts/schema';
import type { ReplayAnswer, ReplayAsk, ReplayStep } from '../protocol';
import { navigationKind, refreshProblem, soft404, wrongPlace } from '../crawler/navigation';

export type Recheck =
  | { kind: 'refresh'; route: string; expectedHeadings: string[]; needsFlow: boolean }
  | { kind: 'soft-404'; homeHeadings: string[] }
  | { kind: 'wrong-place'; route: string; ref: string; name: string; expected: string }
  | { kind: 'keyboard'; route: string; steps: ReplayStep[] }
  | { kind: 'dialog'; route: string; steps: ReplayStep[] };

/** The made-up address the soft-404 recheck loads. */
export const MADE_UP = '/fitts-not-a-page-recheck';

/**
 * The recheck for a navigation or keyboard item, when its kind is one Fitts can run again; the
 * redirect kinds (loops, chains, logins, dropped queries, the Back trap) aren't, yet.
 */
export function recheckFor(
  probe: 'navigation' | 'keyboard',
  item: ProbeItem,
  route: string,
  ctx: {
    headings: (route: string) => string[];
    needsFlow: (route: string) => boolean;
    /** The steps that reach the item's state (a dialog), when the run kept them. */
    steps: ReplayStep[];
  },
): Recheck | undefined {
  if (probe === 'keyboard')
    return keyboardKind(item.measured) === 'dialog'
      ? { kind: 'dialog', route, steps: ctx.steps }
      : { kind: 'keyboard', route, steps: [] };
  const kind = navigationKind(item.measured);
  if (kind === 'refresh')
    return {
      kind,
      route,
      expectedHeadings: ctx.headings(route),
      needsFlow: ctx.needsFlow(route),
    };
  if (kind === 'soft-404') return { kind, homeHeadings: ctx.headings('/') };
  if (kind === 'wrong-place') {
    const m = /^"(.*)" went to .* \(its link says (.+)\)$/.exec(item.measured);
    if (!m?.[1] || !m[2] || !item.ref) return undefined;
    return { kind, route, ref: item.ref, name: m[1], expected: m[2] };
  }
  return undefined;
}

/** What the replayer runs for a recheck (with the page probes, so new breakage shows). */
export function recheckAsk(r: Recheck, device: string | null): ReplayAsk {
  const probes: PageProbeName[] = [...PAGE_PROBES];
  switch (r.kind) {
    case 'refresh':
      return { start: { path: r.route, device }, steps: [], probes, facts: r.route };
    case 'soft-404':
      return { start: { path: '/', device }, steps: [], probes: [], facts: MADE_UP };
    case 'wrong-place':
      return {
        start: { path: r.route, device },
        steps: [{ kind: 'click', ref: r.ref, target: { role: 'link', name: r.name } }],
        probes: [],
      };
    case 'keyboard':
      return { start: { path: r.route, device }, steps: [], probes, keyboard: true };
    case 'dialog':
      return { start: { path: r.route, device }, steps: r.steps, probes: [], dialog: true };
  }
}

/**
 * The problems the recheck measured now, for the finding's probe, or why it couldn't measure
 * (a reason, which fails the fix: no "verified" without proof).
 */
export function recheckItems(r: Recheck, a: ReplayAnswer): ProbeItem[] | { error: string } {
  if (!a.ok) return { error: `the check couldn’t run: ${a.error ?? 'the replay failed'}` };
  switch (r.kind) {
    case 'refresh': {
      if (!a.facts) return { error: 'the page’s fresh load wasn’t measured' };
      const p = refreshProblem({
        route: r.route,
        status: a.facts.status,
        mainText: a.facts.mainText,
        ...(a.facts.errorText ? { errorText: a.facts.errorText } : {}),
        headings: a.facts.headings,
        expectedHeadings: r.expectedHeadings,
        needsFlow: r.needsFlow,
      });
      return p ? [p] : [];
    }
    case 'soft-404': {
      if (!a.facts) return { error: 'the made-up address wasn’t measured' };
      const p = soft404({
        path: MADE_UP,
        status: a.facts.status,
        headings: a.facts.headings,
        homeHeadings: r.homeHeadings,
        text: a.facts.text,
      });
      return p ? [p] : [];
    }
    case 'wrong-place': {
      if (a.missing.length) return { error: `“${r.name}” isn’t on ${r.route} any more` };
      const last = a.traces.at(-1);
      const p = wrongPlace({
        ref: r.ref,
        name: r.name,
        expected: r.expected,
        arrived: a.path,
        redirects: last?.redirects ?? [],
      });
      return p ? [p] : [];
    }
    case 'keyboard':
      if (!a.keyboard) return { error: 'the Tab sweep didn’t run' };
      return keyboardProblems({ stops: a.keyboard.stops, ...a.keyboard.facts }).items;
    case 'dialog':
      if (!a.dialog) return { error: 'the dialog didn’t open, so it couldn’t be checked' };
      return dialogProblems(a.dialog);
  }
}
