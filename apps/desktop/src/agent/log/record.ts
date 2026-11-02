// The action log (SPEC-phase4 §6A): one ActionRecord per action from what main measured (the
// OpTrace), and the things Fitts noticed as Observations, each a template over a measurement.
// No model call anywhere here: the wording is copy.ts's, the numbers are the page's.
import type {
  ActionRecord,
  Observation,
  ObservationKind,
  ProbeItem,
  ProbeName,
  ProbeResult,
} from '@fitts/schema';
import { copy } from '../../renderer/copy';
import { format } from '../../renderer/lib/format';
import type { OpTrace } from '../protocol';

/** A response slower than this, with no loading indicator, is worth a line (§6A). */
export const SLOW_MS = 1000;
/** A response slower than this is slow even with a loading indicator. */
export const VERY_SLOW_MS = 2500;
/** A page load slower than this is slow. */
export const SLOW_LOAD_MS = 3000;

export interface RecordInput {
  step: number;
  /** The run clock (ms) when the action started. */
  at: number;
  kind: ActionRecord['kind'];
  target?: ActionRecord['target'];
  from: string;
  to: string;
  trace?: OpTrace | undefined;
  journeyId?: string;
}

const pathOf = (url: string): string => {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`.slice(0, 80);
  } catch {
    return url.slice(0, 80);
  }
};

/** One record from an action and its trace. */
export function buildRecord(input: RecordInput): ActionRecord {
  const t = input.trace;
  const reqs = t?.requests ?? [];
  const done = reqs.filter((r) => r.endMs !== null);
  const slowest = [...done].sort(
    (a, b) => (b.endMs ?? 0) - b.startMs - ((a.endMs ?? 0) - a.startMs),
  )[0];
  return {
    id: `act-${input.step}`,
    step: input.step,
    at: input.at,
    kind: input.kind,
    ...(input.target ? { target: input.target } : {}),
    from: input.from,
    to: input.to,
    ms: {
      firstChange: t?.feedback?.firstChangeMs ?? null,
      busy: t?.feedback?.busyMs ?? null,
      settled: t?.settledMs ?? null,
      navigation: t?.navigationMs ?? null,
    },
    requests: {
      count: reqs.length,
      failed: reqs.filter((r) => r.status >= 400 || (r.endMs !== null && r.status === 0)).length,
      ...(slowest
        ? {
            slowest: {
              method: slowest.method,
              path: pathOf(slowest.url),
              ms: (slowest.endMs ?? slowest.startMs) - slowest.startMs,
              status: slowest.status,
            },
          }
        : {}),
    },
    console: {
      errors: t?.console?.errors ?? 0,
      ...(t?.console?.first ? { first: t.console.first.slice(0, 120) } : {}),
    },
    ...(t?.redirects?.length ? { redirects: t.redirects.slice(0, 8) } : {}),
    observations: [],
    ...(input.journeyId ? { journeyId: input.journeyId } : {}),
  };
}

/**
 * How long the page took to answer an action: when the action asked the server for something,
 * until that answer was on screen (settled, less its 300 ms of quiet), since the page often
 * echoes typing at once; otherwise the first change, or the page load.
 */
export function responseMs(record: ActionRecord): number | null {
  if (record.requests.count > 0 && record.ms.settled !== null)
    return Math.max(0, record.ms.settled - 300);
  return record.ms.firstChange ?? record.ms.navigation;
}

/** The longest the action waited on the server with no loading indicator, if it did. */
const waitedSilently = (record: ActionRecord): number | null =>
  record.ms.busy === null && (record.requests.slowest?.ms ?? 0) > SLOW_MS
    ? (record.requests.slowest?.ms ?? null)
    : null;

const secs = (ms: number) => `${(Math.round(ms / 100) / 10).toFixed(1)}`;

/** Templates over the record: what the action's own measurements say (§6A.2). */
export function noticeAction(
  record: ActionRecord,
  trace: OpTrace | undefined,
  nextId: () => string,
  cell?: string,
): Observation[] {
  const out: Observation[] = [];
  const n = copy.noticed;
  const name = record.target?.name || record.target?.ref || 'it';
  const verb = record.kind === 'type' ? 'Typed in' : 'Tapped';
  const base = {
    step: record.step,
    route: record.from,
    ...(cell ? { cell } : {}),
    ...(record.target ? { ref: record.target.ref } : {}),
  };
  const add = (kind: ObservationKind, text: string, severityHint: Observation['severityHint']) =>
    out.push({ id: nextId(), ...base, kind, text, severityHint });
  const acted = record.kind === 'click' || record.kind === 'type' || record.kind === 'key';
  const navigated = record.to !== record.from;
  const fb = trace?.feedback ?? null;
  const first = record.ms.firstChange;
  // Slow, or slow with nothing on screen.
  if (acted && first !== null && first > SLOW_MS && record.ms.busy === null)
    add('no-feedback', format(n.noFeedback, { verb, name, s: secs(first), first: secs(first) }), 2);
  else if (acted && waitedSilently(record) !== null)
    add('no-feedback', format(n.waited, { verb, name, s: secs(waitedSilently(record) ?? 0) }), 2);
  else if (acted && first !== null && first > VERY_SLOW_MS)
    add('slow', format(n.slow, { verb, name, s: secs(first) }), 2);
  if (
    (record.kind === 'navigate' || record.kind === 'load') &&
    record.ms.navigation !== null &&
    record.ms.navigation > SLOW_LOAD_MS
  )
    add('slow', format(n.slowLoad, { path: record.to, s: secs(record.ms.navigation) }), 2);
  // A tap that did nothing at all.
  if (
    record.kind === 'click' &&
    !navigated &&
    first === null &&
    record.requests.count === 0 &&
    !trace?.opened &&
    !fb?.moved
  )
    add('nothing-happened', format(n.nothingHappened, { name }), 2);
  // Saved on the server, silent on the screen.
  const wrote = (trace?.requests ?? []).some(
    (r) => /^(POST|PUT|PATCH|DELETE)$/i.test(r.method) && r.status >= 200 && r.status < 300,
  );
  if (
    record.kind === 'click' &&
    wrote &&
    !navigated &&
    (fb?.added.length ?? 0) === 0 &&
    (fb?.live.length ?? 0) === 0
  )
    add('silent-save', format(n.silentSave, { name }), 2);
  // Requests that failed, console errors, redirect chains.
  const failed = (trace?.requests ?? []).find((r) => r.status >= 400);
  if (failed)
    add(
      'request-failed',
      format(n.requestFailed, {
        name,
        method: failed.method,
        path: pathOf(failed.url),
        status: String(failed.status),
      }),
      3,
    );
  if (record.console.errors > 0)
    add(
      'console-error',
      format(n.consoleError, {
        n: String(record.console.errors),
        errors: record.console.errors === 1 ? 'error' : 'errors',
        name,
      }),
      2,
    );
  if (record.redirects && record.redirects.length >= 2)
    add(
      'redirect',
      format(n.redirect, {
        path: record.from,
        hops: record.redirects.slice(0, -1).join(', '),
        to: record.redirects[record.redirects.length - 1] ?? record.to,
      }),
      1,
    );
  return out;
}

/** Which kind of note a probe's failing item is, and how much it matters (§6A.2). */
export const PROBE_NOTE: Record<
  ProbeName,
  { kind: ObservationKind; hint: Observation['severityHint'] }
> = {
  contrast: { kind: 'hard-to-read', hint: 3 },
  'target-size': { kind: 'too-small', hint: 2 },
  'fitts-id': { kind: 'too-small', hint: 1 },
  'font-inventory': { kind: 'inconsistent', hint: 1 },
  spacing: { kind: 'inconsistent', hint: 1 },
  'label-consistency': { kind: 'inconsistent', hint: 2 },
  'feedback-timing': { kind: 'no-feedback', hint: 2 },
  'back-mid-flow': { kind: 'state', hint: 3 },
  'error-message': { kind: 'error-text', hint: 3 },
  'placeholder-leak': { kind: 'leaked', hint: 3 },
  'focus-visible': { kind: 'keyboard', hint: 3 },
  'button-name': { kind: 'missing-name', hint: 3 },
  'link-name': { kind: 'missing-name', hint: 3 },
  links: { kind: 'broken-link', hint: 2 },
  network: { kind: 'perf', hint: 2 },
  'web-vitals': { kind: 'perf', hint: 1 },
  'viewport-sweep': { kind: 'cut-off', hint: 2 },
  'text-spacing': { kind: 'cut-off', hint: 2 },
  'resize-text': { kind: 'cut-off', hint: 2 },
  orientation: { kind: 'cut-off', hint: 2 },
  axe: { kind: 'missing-detail', hint: 2 },
  keyboard: { kind: 'keyboard', hint: 3 },
  navigation: { kind: 'wrong-place', hint: 3 },
  surprise: { kind: 'focus-moved', hint: 3 },
  state: { kind: 'state', hint: 3 },
  perf: { kind: 'perf', hint: 2 },
};

/** The dedupe key of a probe item's note: one per route, probe and element (and what it measured). */
export const probeNoteKey = (probe: ProbeName, route: string, item: ProbeItem) =>
  `${route}|${probe}|${item.ref}|${item.measured}`;

/** One note per failing item of a probe result, in Fitts's words (§6A.2). */
export function noticeProbe(
  result: ProbeResult,
  step: number,
  nextId: () => string,
  nameOf: (ref: string) => string | undefined,
  seen: Set<string>,
  cell?: string,
): Observation[] {
  if (result.pass) return [];
  const out: Observation[] = [];
  const t = copy.noticed.probe;
  for (const item of result.items.slice(0, 6)) {
    const key = probeNoteKey(result.probe, result.route, item);
    if (seen.has(key)) continue;
    seen.add(key);
    const name = nameOf(item.ref) || item.selector || item.ref;
    const text = format(t[result.probe], {
      name,
      measured: item.measured,
      expected: item.expected,
      what: result.probe === 'button-name' ? 'button' : 'link',
    });
    const note = PROBE_NOTE[result.probe];
    out.push({
      id: nextId(),
      step,
      route: result.route,
      ...((cell ?? result.device) ? { cell: cell ?? result.device } : {}),
      kind: note.kind,
      text,
      ...(item.ref ? { ref: item.ref } : {}),
      evidenceId: result.evidenceId,
      severityHint: note.hint,
    });
  }
  return out;
}

/** The compact line the brain and the journey runner see for a past action (§6A.4). */
export function recordLine(record: ActionRecord, observations: Observation[]): string {
  const verb =
    record.kind === 'click'
      ? 'tapped'
      : record.kind === 'type'
        ? 'typed in'
        : record.kind === 'navigate' || record.kind === 'load'
          ? 'opened'
          : record.kind === 'back'
            ? 'went back'
            : 'pressed';
  const what =
    record.kind === 'navigate' || record.kind === 'load'
      ? record.to
      : record.kind === 'back'
        ? ''
        : (record.target?.name ?? record.target?.ref ?? '');
  const parts = [`${verb} ${what}`.trim()];
  if (record.to !== record.from) parts[0] += ` → ${record.to}`;
  const t = responseMs(record);
  if (t !== null) parts.push(`${secs(t)} s`);
  if (
    (record.ms.firstChange !== null &&
      record.ms.firstChange > SLOW_MS &&
      record.ms.busy === null) ||
    waitedSilently(record) !== null
  )
    parts.push('no loading indicator');
  if (record.requests.failed > 0) parts.push(`${record.requests.failed} failed request(s)`);
  const mine = observations.filter((o) => record.observations.includes(o.id));
  if (mine.length)
    parts.push(`noticed: ${mine.map((o) => o.text.replace(/\*\*/g, '')).join('; ')}`);
  return parts.join(' · ');
}

/** Counts by kind and the latest lines, for the decider (§6A.4). */
export function noticedSummary(
  observations: Observation[],
  latest = 5,
): { byKind: Record<string, number>; latest: string[] } {
  const byKind: Record<string, number> = {};
  for (const o of observations) byKind[o.kind] = (byKind[o.kind] ?? 0) + 1;
  return {
    byKind,
    latest: observations.slice(-latest).map((o) => `${o.route}: ${o.text.replace(/\*\*/g, '')}`),
  };
}

/** The observations a finding rests on: cited as evidence, or on its element and page. */
export function observationsFor(
  finding: {
    route: string;
    elementRef?: string | null;
    evidenceIds?: string[];
    evidence?: string[];
  },
  observations: Observation[],
  evidenceIds: Set<string>,
): Observation[] {
  return observations.filter(
    (o) =>
      evidenceIds.has(o.id) ||
      (o.evidenceId !== undefined && evidenceIds.has(o.evidenceId)) ||
      (finding.elementRef !== undefined &&
        finding.elementRef !== null &&
        o.ref === finding.elementRef &&
        o.route === finding.route),
  );
}
