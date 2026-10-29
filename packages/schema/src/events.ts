// The run event log (SPEC-phase2 §12.1). A run is an append-only list of events; RunState is
// `reduce` over them. Main, the agent and the renderer share this one reducer, so the log
// powers the UI, resume, replay, cost reports and the run picker.
import type {
  Brief,
  Change,
  ChatItem,
  Finding,
  GateRequest,
  Mode,
  RunActivity,
  RunPhase,
  RunState,
} from './index';

type Route = RunState['routes'][number];

export type RunEvent =
  // Run lifecycle
  | { type: 'run.started'; state: RunState }
  | { type: 'run.snapshot'; state: RunState }
  | { type: 'phase.changed'; phase: RunPhase }
  | { type: 'activity.changed'; activity: RunActivity }
  | { type: 'mode.changed'; mode: Mode }
  | { type: 'clock.tick'; elapsedMs: number }
  // Steps and routes
  | { type: 'step.started'; step: number; stepEstimate: number }
  | { type: 'step.finished'; step: number; shot?: string }
  | { type: 'route.discovered'; route: Route }
  | { type: 'route.status'; route: Route }
  | { type: 'routes.set'; routes: Route[] }
  | { type: 'controls.updated'; done: number; total: number }
  | { type: 'now.changed'; nowText?: string }
  // Findings and changes
  | { type: 'finding.created'; finding: Finding }
  | { type: 'finding.updated'; finding: Finding }
  | { type: 'findings.set'; findings: Finding[] }
  | { type: 'change.created'; change: Change }
  | { type: 'change.updated'; change: Change }
  | { type: 'changes.set'; changes: Change[] }
  | { type: 'fixing.changed'; fixingCount: number }
  // Chat
  | { type: 'chat.item'; item: ChatItem }
  | { type: 'chat.item.updated'; item: ChatItem }
  | { type: 'chat.set'; items: ChatItem[] }
  | { type: 'typing.changed'; typing: boolean }
  | { type: 'waiting.changed'; waitingFor?: string }
  // Gate
  | { type: 'gate.requested'; gate: GateRequest }
  | { type: 'gate.decided'; gateId: string; decision?: 'deny' | 'other' | 'allow' }
  // User
  | { type: 'user.action'; label: string }
  | { type: 'user.actions.cleared' }
  | { type: 'queued.added'; text: string }
  | { type: 'queued.delivered'; count: number }
  | { type: 'brief.updated'; brief: Brief }
  // Other
  | { type: 'cost'; cost: RunState['cost'] }
  | { type: 'overlay.set'; overlays: RunState['overlays'] }
  | { type: 'rewind.set'; step?: number }
  /** Anything else; `unset` lists keys to delete (JSON drops `undefined` values). */
  | { type: 'run.patch'; patch: Partial<RunState>; unset?: string[] }
  | { type: 'error'; message: string };

export type RunEventType = RunEvent['type'];

/** One line of `runs/<runId>/events.ndjson`. */
export interface LoggedEvent {
  v: 1;
  seq: number;
  ts: number;
  projectId: string;
  runId: string;
  event: RunEvent;
}

/** A snapshot is written every this many events, so a long run loads fast (§12.1). */
export const SNAPSHOT_EVERY = 200;

const byId = <T extends { id: string }>(list: T[], item: T): T[] => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
};

const byPath = (list: Route[], route: Route): Route[] => {
  const i = list.findIndex((r) => r.path === route.path);
  if (i === -1) return [...list, route];
  const next = list.slice();
  next[i] = route;
  return next;
};

/**
 * The one reducer. Pure: never mutates `s`; returns `s` itself when nothing changes. A state
 * before `run.started` is `undefined`, and events other than `run.started`/`run.snapshot`
 * are ignored until then.
 */
export function reduce(s: RunState | undefined, e: RunEvent): RunState | undefined {
  if (e.type === 'run.started' || e.type === 'run.snapshot') return e.state;
  if (!s) return s;
  switch (e.type) {
    case 'phase.changed':
      return { ...s, phase: e.phase };
    case 'activity.changed':
      return { ...s, activity: e.activity };
    case 'mode.changed':
      return { ...s, mode: e.mode };
    case 'clock.tick':
      return { ...s, elapsedMs: e.elapsedMs };
    case 'step.started':
      return { ...s, step: e.step, stepEstimate: e.stepEstimate };
    case 'step.finished':
      return s;
    case 'route.discovered':
    case 'route.status':
      return { ...s, routes: byPath(s.routes, e.route) };
    case 'routes.set':
      return { ...s, routes: e.routes };
    case 'controls.updated':
      return { ...s, controlsTried: { done: e.done, total: e.total } };
    case 'now.changed': {
      const next = { ...s };
      if (e.nowText === undefined) delete next.nowText;
      else next.nowText = e.nowText;
      return next;
    }
    case 'finding.created':
    case 'finding.updated':
      return { ...s, findings: byId(s.findings, e.finding) };
    case 'findings.set':
      return { ...s, findings: e.findings };
    case 'change.created':
    case 'change.updated':
      return { ...s, changes: byId(s.changes, e.change) };
    case 'changes.set':
      return { ...s, changes: e.changes };
    case 'fixing.changed':
      return { ...s, fixingCount: e.fixingCount };
    case 'chat.item':
    case 'chat.item.updated':
      return { ...s, chat: byId(s.chat, e.item) };
    case 'chat.set':
      return { ...s, chat: e.items };
    case 'typing.changed':
      return { ...s, fittsTyping: e.typing };
    case 'waiting.changed': {
      const next = { ...s };
      if (e.waitingFor === undefined) delete next.waitingFor;
      else next.waitingFor = e.waitingFor;
      return next;
    }
    case 'gate.requested':
      return { ...s, gate: e.gate };
    case 'gate.decided': {
      if (s.gate?.id !== e.gateId) return s;
      const next = { ...s };
      delete next.gate;
      return next;
    }
    case 'user.action':
      return { ...s, driverClicks: [...s.driverClicks, e.label] };
    case 'user.actions.cleared':
      return { ...s, driverClicks: [] };
    case 'queued.added':
      return { ...s, queued: [...s.queued, e.text] };
    case 'queued.delivered':
      return { ...s, queued: s.queued.slice(e.count) };
    case 'brief.updated':
      return { ...s, brief: e.brief };
    case 'cost':
      return { ...s, cost: e.cost };
    case 'overlay.set':
      return { ...s, overlays: e.overlays };
    case 'rewind.set': {
      const next = { ...s };
      if (e.step === undefined) delete next.rewindStep;
      else next.rewindStep = e.step;
      return next;
    }
    case 'run.patch': {
      const next = { ...s, ...e.patch } as Record<string, unknown>;
      for (const [k, v] of Object.entries(e.patch)) if (v === undefined) delete next[k];
      for (const k of e.unset ?? []) delete next[k];
      return next as unknown as RunState;
    }
    case 'error':
      return s;
  }
}

/** Replays a list of events from nothing. */
export function replay(events: RunEvent[], from?: RunState): RunState | undefined {
  return events.reduce<RunState | undefined>(reduce, from);
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Keys `diff` turns into specific events; anything else becomes a `run.patch`. */
const HANDLED = new Set<keyof RunState>([
  'runId',
  'projectId',
  'phase',
  'activity',
  'mode',
  'elapsedMs',
  'step',
  'stepEstimate',
  'nowText',
  'routes',
  'controlsTried',
  'findings',
  'changes',
  'chat',
  'queued',
  'overlays',
  'gate',
  'rewindStep',
  'fixingCount',
  'cost',
  'brief',
  'fittsTyping',
  'waitingFor',
  'driverClicks',
]);

/** Changes in a list keyed by id: created/updated, or `set` when items vanished or moved. */
function diffList<T extends { id: string }>(
  prev: T[],
  next: T[],
  created: (x: T) => RunEvent,
  updated: (x: T) => RunEvent,
  set: (xs: T[]) => RunEvent,
): RunEvent[] {
  const prevIds = prev.map((x) => x.id);
  const nextIds = next.map((x) => x.id);
  // Only appends and in-place edits are expressible item by item.
  const isPrefix = prevIds.every((id, i) => nextIds[i] === id);
  if (!isPrefix) return [set(next)];
  const out: RunEvent[] = [];
  next.forEach((x, i) => {
    const before = prev[i];
    if (!before) out.push(created(x));
    else if (!same(before, x)) out.push(updated(x));
  });
  return out;
}

/**
 * The events that turn `prev` into `next`. `reduce` over them reproduces `next` exactly
 * (a unit test checks this over every mock scenario). Used by the P1 stub agent, which runs
 * the scripted engine, and by anything that only has states to compare.
 */
export function diff(prev: RunState | undefined, next: RunState): RunEvent[] {
  if (!prev || prev.runId !== next.runId || prev.projectId !== next.projectId) {
    return [{ type: 'run.started', state: next }];
  }
  const out: RunEvent[] = [];
  if (prev.phase !== next.phase) out.push({ type: 'phase.changed', phase: next.phase });
  if (prev.activity !== next.activity)
    out.push({ type: 'activity.changed', activity: next.activity });
  if (prev.mode !== next.mode) out.push({ type: 'mode.changed', mode: next.mode });
  if (prev.step !== next.step || prev.stepEstimate !== next.stepEstimate)
    out.push({ type: 'step.started', step: next.step, stepEstimate: next.stepEstimate });
  if (prev.elapsedMs !== next.elapsedMs)
    out.push({ type: 'clock.tick', elapsedMs: next.elapsedMs });
  if (prev.nowText !== next.nowText) out.push({ type: 'now.changed', nowText: next.nowText });

  if (!same(prev.routes, next.routes)) {
    const prevPaths = prev.routes.map((r) => r.path);
    const isPrefix = prevPaths.every((p, i) => next.routes[i]?.path === p);
    if (!isPrefix) out.push({ type: 'routes.set', routes: next.routes });
    else
      next.routes.forEach((r, i) => {
        const before = prev.routes[i];
        if (!before) out.push({ type: 'route.discovered', route: r });
        else if (!same(before, r)) out.push({ type: 'route.status', route: r });
      });
  }
  if (!same(prev.controlsTried, next.controlsTried))
    out.push({ type: 'controls.updated', ...next.controlsTried });

  out.push(
    ...diffList(
      prev.findings,
      next.findings,
      (finding) => ({ type: 'finding.created', finding }),
      (finding) => ({ type: 'finding.updated', finding }),
      (findings) => ({ type: 'findings.set', findings }),
    ),
    ...diffList(
      prev.changes,
      next.changes,
      (change) => ({ type: 'change.created', change }),
      (change) => ({ type: 'change.updated', change }),
      (changes) => ({ type: 'changes.set', changes }),
    ),
    ...diffList(
      prev.chat,
      next.chat,
      (item) => ({ type: 'chat.item', item }),
      (item) => ({ type: 'chat.item.updated', item }),
      (items) => ({ type: 'chat.set', items }),
    ),
  );
  if (prev.fixingCount !== next.fixingCount)
    out.push({ type: 'fixing.changed', fixingCount: next.fixingCount });

  if (!same(prev.queued, next.queued)) {
    const delivered = prev.queued.length - next.queued.length;
    if (delivered > 0 && same(prev.queued.slice(delivered), next.queued))
      out.push({ type: 'queued.delivered', count: delivered });
    else if (same(prev.queued, next.queued.slice(0, prev.queued.length)))
      for (const text of next.queued.slice(prev.queued.length))
        out.push({ type: 'queued.added', text });
    else out.push({ type: 'run.patch', patch: { queued: next.queued } });
  }

  if (!same(prev.gate, next.gate)) {
    if (prev.gate && !next.gate) out.push({ type: 'gate.decided', gateId: prev.gate.id });
    else if (next.gate) out.push({ type: 'gate.requested', gate: next.gate });
  }
  if (!same(prev.driverClicks, next.driverClicks)) {
    const appended = same(prev.driverClicks, next.driverClicks.slice(0, prev.driverClicks.length));
    if (appended)
      for (const label of next.driverClicks.slice(prev.driverClicks.length))
        out.push({ type: 'user.action', label });
    else {
      out.push({ type: 'user.actions.cleared' });
      for (const label of next.driverClicks) out.push({ type: 'user.action', label });
    }
  }
  if (!same(prev.brief, next.brief)) out.push({ type: 'brief.updated', brief: next.brief });
  if (!same(prev.cost, next.cost)) out.push({ type: 'cost', cost: next.cost });
  if (!same(prev.overlays, next.overlays))
    out.push({ type: 'overlay.set', overlays: next.overlays });
  if (prev.rewindStep !== next.rewindStep) out.push({ type: 'rewind.set', step: next.rewindStep });
  if (prev.fittsTyping !== next.fittsTyping)
    out.push({ type: 'typing.changed', typing: next.fittsTyping });
  if (prev.waitingFor !== next.waitingFor)
    out.push({ type: 'waiting.changed', waitingFor: next.waitingFor });

  const patch: Partial<RunState> = {};
  const unset: string[] = [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]) as Set<keyof RunState>;
  for (const k of keys) {
    if (HANDLED.has(k) || same(prev[k], next[k])) continue;
    if (next[k] === undefined) unset.push(k);
    else (patch as Record<string, unknown>)[k] = next[k];
  }
  if (Object.keys(patch).length > 0 || unset.length > 0)
    out.push({ type: 'run.patch', patch, ...(unset.length ? { unset } : {}) });
  return out;
}
