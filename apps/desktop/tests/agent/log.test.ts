// @vitest-environment node
// The action log (SPEC-phase4 §6A): records from traces, the noticed lines for every kind (a
// template over a measurement, never a model), dedupe per route, the compact line the brain
// sees, and the reducer.
import type { Observation, ProbeName, ProbeResult, RunState } from '@fitts/schema';
import { reduce } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import {
  PROBE_NOTE,
  buildRecord,
  noticeAction,
  noticeProbe,
  noticedSummary,
  observationsFor,
  recordLine,
  responseMs,
} from '../../src/agent/log/record';
import type { OpTrace } from '../../src/agent/protocol';

const req = (over: Partial<OpTrace['requests'][number]> = {}): OpTrace['requests'][number] => ({
  url: 'http://localhost:5173/api/search?q=x',
  method: 'GET',
  route: '/search',
  type: 'Fetch',
  status: 200,
  startMs: 10,
  endMs: 1510,
  bytes: 1200,
  ...over,
});

const trace = (
  over: Partial<OpTrace> = {},
  fb: Partial<NonNullable<OpTrace['feedback']>> = {},
): OpTrace => ({
  feedback: {
    firstChangeMs: 1600,
    busyMs: null,
    added: ['20,000 results'],
    live: [],
    errors: [],
    moved: false,
    ...fb,
  },
  requests: [req()],
  ...over,
});

const ids = () => {
  let n = 0;
  return () => `obs-${++n}`;
};

describe('buildRecord', () => {
  it('keeps the timings, the requests (count, failed, slowest), console errors and redirects', () => {
    const r = buildRecord({
      step: 7,
      at: 12_000,
      kind: 'type',
      target: { name: 'Search', role: 'searchbox', ref: 'search-input' },
      from: '/search',
      to: '/search',
      trace: trace({
        settledMs: 1900,
        console: { errors: 2, first: 'TypeError: x is not a function' },
        requests: [
          req(),
          req({ url: 'http://localhost:5173/api/slow', status: 500, startMs: 20, endMs: 2020 }),
        ],
      }),
    });
    expect(r).toMatchObject({
      id: 'act-7',
      step: 7,
      kind: 'type',
      from: '/search',
      to: '/search',
      ms: { firstChange: 1600, busy: null, settled: 1900, navigation: null },
      requests: {
        count: 2,
        failed: 1,
        slowest: { method: 'GET', path: '/api/slow', ms: 2000, status: 500 },
      },
      console: { errors: 2, first: 'TypeError: x is not a function' },
      observations: [],
    });
    expect(
      buildRecord({
        step: 1,
        at: 0,
        kind: 'navigate',
        from: '/',
        to: '/a',
        trace: { feedback: null, requests: [], navigationMs: 3400, redirects: ['/a', '/b', '/c'] },
      }),
    ).toMatchObject({
      ms: { navigation: 3400 },
      redirects: ['/a', '/b', '/c'],
    });
  });
});

describe('noticeAction: the action’s own measurements (§6A.2)', () => {
  const typed = (t: OpTrace) =>
    buildRecord({
      step: 3,
      at: 0,
      kind: 'type',
      target: { name: 'Search', role: 'searchbox', ref: 'search-input' },
      from: '/search',
      to: '/search',
      trace: t,
    });
  const tapped = (t: OpTrace, to = '/') =>
    buildRecord({
      step: 4,
      at: 0,
      kind: 'click',
      target: { name: 'Save', role: 'button', ref: 'save' },
      from: '/',
      to,
      trace: t,
    });

  it('a slow response with nothing on screen is "no feedback", with the seconds', () => {
    const t = trace();
    const [o] = noticeAction(typed(t), t, ids());
    expect(o).toMatchObject({
      kind: 'no-feedback',
      step: 3,
      route: '/search',
      ref: 'search-input',
      severityHint: 2,
    });
    expect(o?.text).toBe(
      'Typed in **Search** · the page changed in 1.6 s, with nothing on screen for the first 1.6 s',
    );
  });

  it('a slow response with a loading indicator is just slow; a quick one says nothing', () => {
    const slow = trace({}, { firstChangeMs: 2800, busyMs: 100 });
    expect(noticeAction(typed(slow), slow, ids())[0]?.text).toBe(
      'Typed in **Search** · took 2.8 s to respond',
    );
    const quick = trace({ requests: [req({ endMs: 110 })] }, { firstChangeMs: 120, busyMs: null });
    expect(noticeAction(typed(quick), quick, ids())).toEqual([]);
    // Typing echoes at once, but the answer took 1.5 s with no loading indicator.
    const echoed = trace({ settledMs: 1810 }, { firstChangeMs: 4, busyMs: null });
    const [o] = noticeAction(typed(echoed), echoed, ids());
    expect(o).toMatchObject({ kind: 'no-feedback' });
    expect(o?.text).toBe(
      'Typed in **Search** · waited 1.5 s for the server, with nothing on screen saying it was working',
    );
    expect(responseMs(typed(echoed))).toBe(1510);
  });

  it('a tap that changed nothing, and a save the screen never mentioned', () => {
    const nothing: OpTrace = {
      feedback: {
        firstChangeMs: null,
        busyMs: null,
        added: [],
        live: [],
        errors: [],
        moved: false,
      },
      requests: [],
    };
    expect(noticeAction(tapped(nothing), nothing, ids())[0]).toMatchObject({
      kind: 'nothing-happened',
      text: 'Tapped **Save** · nothing changed on screen',
    });
    const silent: OpTrace = {
      feedback: {
        firstChangeMs: null,
        busyMs: null,
        added: [],
        live: [],
        errors: [],
        moved: false,
      },
      requests: [
        req({ method: 'POST', status: 201, url: 'http://localhost:5173/api/contacts', endMs: 110 }),
      ],
    };
    const notes = noticeAction(tapped(silent), silent, ids());
    expect(notes.map((n) => n.kind)).toEqual(['silent-save']);
    expect(notes[0]?.text).toBe(
      'Tapped **Save** · the server saved it, but nothing on screen said so',
    );
  });

  it('failed requests, console errors and redirect chains', () => {
    const t = trace(
      { console: { errors: 2, first: 'x' }, redirects: ['/old', '/older', '/new'] },
      { firstChangeMs: 200 },
    );
    t.requests = [req({ status: 500, url: 'http://localhost:5173/api/messages', endMs: 110 })];
    const r = { ...tapped(t, '/new'), redirects: ['/old', '/older', '/new'] };
    const kinds = noticeAction(r, t, ids()).map((n) => [n.kind, n.text, n.severityHint]);
    expect(kinds).toEqual([
      [
        'request-failed',
        'Noticed a request failed after tapping **Save**: GET /api/messages → 500',
        3,
      ],
      ['console-error', 'Noticed 2 errors in the page’s console after tapping **Save**', 2],
      ['redirect', 'Noticed / bounced through /old, /older before landing on /new', 1],
    ]);
  });

  it('a slow page load', () => {
    const r = buildRecord({
      step: 1,
      at: 0,
      kind: 'navigate',
      from: '/',
      to: '/search',
      trace: { feedback: null, requests: [], navigationMs: 3400 },
    });
    expect(noticeAction(r, undefined, ids())[0]?.text).toBe(
      'Opened /search · the page took 3.4 s to load',
    );
  });

  it('carries the device cell when there is one', () => {
    const t = trace();
    expect(noticeAction(typed(t), t, ids(), 'phone')[0]?.cell).toBe('phone');
  });
});

/** What each probe really measures (from its page script), so the snapshot shows real lines. */
const SAMPLE: Record<ProbeName, [string, string]> = {
  contrast: ['2.6:1 (#a1a1a1 on #ffffff)', '4.5:1'],
  'target-size': ['28×20px', 'at least 24×24px'],
  'fitts-id': ['4.6 bits (small and far from the last tap)', 'under 4 bits'],
  'font-inventory': ['3 font families (Georgia, system-ui, Trebuchet MS)', 'one or two families'],
  spacing: ['22, 7, 13, 11 and 9px', 'multiples of 4px'],
  'label-consistency': ['NEXT, Create Message and Send Text for one action', 'one name'],
  'feedback-timing': ['nothing on screen for 1.5 s', 'a sign within 1 s'],
  'back-mid-flow': ['Message was empty after Back', 'what was typed kept'],
  'error-message': ['"Error 0x3F", no field marked invalid', 'says what went wrong'],
  'placeholder-leak': ['shows "(null)"', 'the real value'],
  'focus-visible': ['no visible change on focus', 'a visible focus ring'],
  'button-name': ['no accessible name', 'a name'],
  'link-name': ['no accessible name', 'a name'],
  links: ['/help → 404', 'a page that loads'],
  network: ['20,000 items (1.9 MB) in one response', 'paged results'],
  'web-vitals': ['LCP 3.4 s', 'under 2.5 s'],
  'viewport-sweep': ['page is 341px wide at 320px', 'no sideways scrolling at 320px'],
  'text-spacing': ['text clipped with wider spacing', 'text that fits'],
  'resize-text': ['text cut off at 200% text', 'text that fits or wraps'],
  orientation: ['asks for portrait in landscape', 'both orientations'],
  axe: ['Images must have alternate text', 'passes the axe rule'],
  keyboard: ['"div-button" can’t be reached with Tab', 'every control reachable from the keyboard'],
  navigation: [
    '"Contacts" went to /settings/privacy (its link says /contacts)',
    '"Contacts" opens /contacts',
  ],
  surprise: ['"Send" moved 40 px just before the tap', 'controls stay put while the page loads'],
  state: ['/contacts goes blank when contacts fails', 'says what went wrong'],
  perf: [
    'the main content shows after 3.4 s on a mid-range phone on Slow 4G (dev build)',
    'under 2.5 s',
  ],
  'android-target': ['"Remove Margherita" is 36×36dp', 'at least 48×48dp'],
  'android-label': [
    'the ViewGroup header-cart-button has no label a screen reader can read',
    'a content description',
  ],
  'android-duplicate-label': [
    '2 controls are all called "Add to order"',
    'each control named for what it does',
  ],
  'android-duplicate-bounds': [
    '"Margherita" and the ViewGroup menu-row-favorite-margherita are two tap targets in exactly the same place',
    'one control per place on the screen',
  ],
  'android-editable-desc': [
    'the field pickup-name has a content description ("Your name")',
    'a hint or label instead',
  ],
  'android-contrast': [
    '"Wood-fired" is about 2.1:1 (estimate from the screen\'s pixels)',
    'at least 4.5:1',
  ],
};

describe('noticeProbe: every probe has a template (§6A.2)', () => {
  const result = (
    probe: ProbeName,
    measured: string,
    expected = 'better',
    ref = 'el-1',
  ): ProbeResult => ({
    evidenceId: `run-1-ev-${probe}`,
    probe,
    route: '/x',
    pass: false,
    items: [{ ref, selector: 'p.x', measured, expected }],
  });
  const nameOf = (ref: string) => (ref === 'el-1' ? 'Send' : undefined);

  it('writes one noticed line per failing item, in Fitts’s words, never "problem"', () => {
    const probes = Object.keys(PROBE_NOTE) as ProbeName[];
    const lines: Record<string, string> = {};
    for (const probe of probes) {
      const [measured, expected] = SAMPLE[probe];
      const [o] = noticeProbe(result(probe, measured, expected), 5, ids(), nameOf, new Set());
      expect(o, probe).toBeDefined();
      expect(o?.kind).toBe(PROBE_NOTE[probe].kind);
      expect(o?.severityHint).toBe(PROBE_NOTE[probe].hint);
      expect(o?.evidenceId).toBe(`run-1-ev-${probe}`);
      expect(o?.text).not.toMatch(/problem|issue|bug/i);
      expect(o?.text.length).toBeGreaterThan(10);
      lines[probe] = o?.text ?? '';
    }
    expect(lines).toMatchSnapshot();
  });

  it('dedupes per route, probe, element and measurement', () => {
    const seen = new Set<string>();
    expect(noticeProbe(result('contrast', '2.6:1'), 1, ids(), nameOf, seen)).toHaveLength(1);
    expect(noticeProbe(result('contrast', '2.6:1'), 2, ids(), nameOf, seen)).toHaveLength(0);
    expect(noticeProbe(result('contrast', '3.1:1'), 3, ids(), nameOf, seen)).toHaveLength(1);
    expect(
      noticeProbe({ ...result('contrast', '2.6:1'), route: '/y' }, 4, ids(), nameOf, seen),
    ).toHaveLength(1);
  });

  it('a passing probe is nothing to notice; a cell rides along', () => {
    expect(
      noticeProbe({ ...result('contrast', 'x'), pass: true }, 1, ids(), nameOf, new Set()),
    ).toEqual([]);
    expect(
      noticeProbe(
        { ...result('target-size', '28×20px'), device: 'phone' },
        1,
        ids(),
        nameOf,
        new Set(),
      )[0]?.cell,
    ).toBe('phone');
  });
});

describe('recordLine and noticedSummary (§6A.4)', () => {
  it('is the compact line the brain reads', () => {
    const t = trace();
    const r = buildRecord({
      step: 3,
      at: 0,
      kind: 'click',
      target: { name: 'NEXT', role: 'button', ref: 'next' },
      from: '/compose',
      to: '/compose/recipient',
      trace: t,
    });
    const notes = noticeAction(r, t, ids());
    r.observations = notes.map((n) => n.id);
    expect(recordLine(r, notes)).toBe(
      'tapped NEXT → /compose/recipient · 1.6 s · no loading indicator · noticed: Tapped NEXT · the page changed in 1.6 s, with nothing on screen for the first 1.6 s',
    );
    expect(noticedSummary(notes)).toEqual({
      byKind: { 'no-feedback': 1 },
      latest: [`/compose: ${notes[0]?.text.replace(/\*\*/g, '')}`],
    });
  });
});

describe('observationsFor: what a finding rests on', () => {
  const obs: Observation[] = [
    {
      id: 'obs-1',
      step: 1,
      route: '/a',
      kind: 'leaked',
      text: 'x',
      ref: 'to',
      evidenceId: 'ev-1',
      severityHint: 3,
    },
    { id: 'obs-2', step: 2, route: '/a', kind: 'slow', text: 'y', ref: 'other', severityHint: 2 },
    { id: 'obs-3', step: 3, route: '/b', kind: 'slow', text: 'z', ref: 'to', severityHint: 2 },
  ];
  it('matches by cited id, by the probe result it came from, or by element and page', () => {
    expect(
      observationsFor({ route: '/a', elementRef: 'to' }, obs, new Set()).map((o) => o.id),
    ).toEqual(['obs-1']);
    expect(
      observationsFor({ route: '/z', elementRef: null }, obs, new Set(['ev-1'])).map((o) => o.id),
    ).toEqual(['obs-1']);
    expect(
      observationsFor({ route: '/z', elementRef: null }, obs, new Set(['obs-2'])).map((o) => o.id),
    ).toEqual(['obs-2']);
  });
});

describe('the reducer keeps the log', () => {
  const base = {
    runId: 'r',
    projectId: 'p',
    phase: 'audit',
    activity: 'acting',
    mode: 'ask-unsure',
    step: 0,
    stepEstimate: 0,
    elapsedMs: 0,
    routes: [],
    controlsTried: { done: 0, total: 0 },
    findings: [],
    changes: [],
    chat: [],
    queued: [],
    overlays: { problems: [] },
    fixingCount: 0,
    cost: {
      spentUsd: 0,
      capUsd: 0,
      byPhase: { fixes: 0, reviewers: 0, crawling: 0, summing: 0, media: 0 },
    },
    brief: {},
    fittsTyping: false,
    driverClicks: [],
  } as unknown as RunState;
  it('appends records and observations, and links an observation to its finding', () => {
    const record = buildRecord({ step: 1, at: 0, kind: 'click', from: '/', to: '/' });
    const o: Observation = {
      id: 'obs-1',
      step: 1,
      route: '/',
      kind: 'slow',
      text: 'x',
      severityHint: 2,
    };
    let s = reduce(base, { type: 'action.recorded', record });
    s = reduce(s, { type: 'observation.added', observation: o });
    s = reduce(s, { type: 'observation.linked', id: 'obs-1', findingId: 'f-1' });
    expect(s?.actions).toEqual([record]);
    expect(s?.observations?.[0]).toMatchObject({ id: 'obs-1', findingId: 'f-1' });
  });
});
