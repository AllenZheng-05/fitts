// @vitest-environment node
// Navigation and keyboard findings verified on the worktree (Allen, Nov 2): the finding's own
// check runs again through the replayer and the crawl's pure checks judge it; pass = the same
// check passes and nothing new breaks.
import { reduce, type Finding, type ProbeItem, type RunEvent, type RunState } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import { FixPipeline, fixSection } from '../../src/agent/fix/pipeline';
import {
  MADE_UP,
  recheckAsk,
  recheckFor,
  recheckItems,
  type Recheck,
} from '../../src/agent/fix/recheck';
import type { FixCall, ReplayAnswer } from '../../src/agent/protocol';
import { titleOf, type Check } from '../../src/agent/review/aggregate';
import type { Site } from '../../src/agent/site-client';

const item = (measured: string, ref = ''): ProbeItem => ({
  ref,
  selector: '',
  measured,
  expected: '',
});
const ctx = {
  headings: (route: string) => (route === '/' ? ['Pizza from the fire'] : ['Your cart']),
  needsFlow: () => false,
  steps: [{ kind: 'click' as const, ref: 'open-dialog' }],
};
const answer = (over: Partial<ReplayAnswer> = {}): ReplayAnswer => ({
  ok: true,
  path: '/',
  results: [],
  focus: [],
  viewport: [],
  traces: [],
  missing: [],
  ...over,
});
const facts = (over: Partial<NonNullable<ReplayAnswer['facts']>> = {}) => ({
  status: 200,
  mainText: 400,
  headings: ['Your cart'],
  text: 'Your cart',
  ...over,
});

describe('recheckFor: which kinds can run again', () => {
  it('refresh, soft 404 and wrong destination; the redirect kinds can’t yet', () => {
    expect(
      recheckFor('navigation', item('refreshing /cart shows a blank page'), '/cart', ctx),
    ).toEqual({
      kind: 'refresh',
      route: '/cart',
      expectedHeadings: ['Your cart'],
      needsFlow: false,
    });
    expect(
      recheckFor(
        'navigation',
        item(
          "/fitts-not-a-page-ab12 (an address that doesn't exist) shows the home page with status 200",
        ),
        '/',
        ctx,
      ),
    ).toEqual({ kind: 'soft-404', homeHeadings: ['Pizza from the fire'] });
    expect(
      recheckFor(
        'navigation',
        item('"Menu" went to /about (its link says /menu)', 'nav-menu'),
        '/',
        ctx,
      ),
    ).toEqual({
      kind: 'wrong-place',
      route: '/',
      ref: 'nav-menu',
      name: 'Menu',
      expected: '/menu',
    });
    expect(
      recheckFor('navigation', item('/old redirects in a loop through /old'), '/', ctx),
    ).toBeUndefined();
  });

  it('a dialog finding reruns the steps that opened it; the rest sweep the page', () => {
    expect(recheckFor('keyboard', item('Esc doesn\'t close the "Share" dialog'), '/', ctx)).toEqual(
      {
        kind: 'dialog',
        route: '/',
        steps: ctx.steps,
      },
    );
    expect(recheckFor('keyboard', item('"Send" can\'t be reached with Tab'), '/', ctx)).toEqual({
      kind: 'keyboard',
      route: '/',
      steps: [],
    });
  });
});

describe('recheckAsk and recheckItems', () => {
  it('refresh: a fresh load and a reload of the route, judged like the crawl', () => {
    const r: Recheck = {
      kind: 'refresh',
      route: '/cart',
      expectedHeadings: ['Your cart'],
      needsFlow: false,
    };
    expect(recheckAsk(r, null)).toMatchObject({
      start: { path: '/cart' },
      facts: '/cart',
      steps: [],
    });
    expect(recheckItems(r, answer({ facts: facts({ mainText: 3 }) }))).toEqual([
      expect.objectContaining({ measured: 'refreshing /cart shows a blank page' }),
    ]);
    expect(recheckItems(r, answer({ facts: facts() }))).toEqual([]);
    expect(recheckItems(r, answer())).toEqual({ error: 'the page’s fresh load wasn’t measured' });
  });

  it('soft 404: the made-up address now says it doesn’t exist', () => {
    const r: Recheck = { kind: 'soft-404', homeHeadings: ['Pizza from the fire'] };
    expect(recheckAsk(r, 'phone')).toMatchObject({
      start: { path: '/', device: 'phone' },
      facts: MADE_UP,
    });
    const home = facts({ headings: ['Pizza from the fire'], text: 'Pizza from the fire' });
    expect(recheckItems(r, answer({ facts: home }))).toHaveLength(1);
    expect(recheckItems(r, answer({ facts: { ...home, status: 404 } }))).toEqual([]);
    expect(recheckItems(r, answer({ facts: { ...home, text: 'Page not found' } }))).toEqual([]);
  });

  it('wrong destination: the click lands where its link says', () => {
    const r: Recheck = {
      kind: 'wrong-place',
      route: '/',
      ref: 'nav-menu',
      name: 'Menu',
      expected: '/menu',
    };
    expect(recheckAsk(r, null).steps).toEqual([
      { kind: 'click', ref: 'nav-menu', target: { role: 'link', name: 'Menu' } },
    ]);
    expect(recheckItems(r, answer({ path: '/about' }))).toHaveLength(1);
    expect(recheckItems(r, answer({ path: '/menu' }))).toEqual([]);
    expect(recheckItems(r, answer({ path: '/', missing: [0] }))).toEqual({
      error: '“Menu” isn’t on / any more',
    });
  });

  it('keyboard: the Tab sweep; dialog: the four dialog checks', () => {
    const k: Recheck = { kind: 'keyboard', route: '/', steps: [] };
    expect(recheckAsk(k, null)).toMatchObject({ keyboard: true });
    const stop = {
      ref: 'a',
      selector: 'a',
      name: 'A',
      rect: { x: 0, y: 0, width: 10, height: 10 },
      visible: 1,
    };
    const kb = (reached: boolean) => ({
      stops: reached ? [stop, { ...stop, ref: 'send', name: 'Send' }] : [stop],
      facts: {
        interactive: [{ ref: 'send', selector: 'div', name: 'Send' }],
        navLinks: 2,
        skipLink: false,
      },
    });
    expect(recheckItems(k, answer({ keyboard: kb(false) }))).toEqual([
      expect.objectContaining({ measured: '"Send" can\'t be reached with Tab' }),
    ]);
    expect(recheckItems(k, answer({ keyboard: kb(true) }))).toEqual([]);
    const d: Recheck = { kind: 'dialog', route: '/', steps: ctx.steps };
    expect(recheckAsk(d, null)).toMatchObject({ dialog: true, steps: ctx.steps });
    const dialog = {
      ref: 'd',
      selector: 'div',
      name: 'Share',
      focusMovedIn: true,
      tabStaysIn: true,
      escCloses: true,
      focusReturned: true,
    };
    expect(recheckItems(d, answer({ dialog }))).toEqual([]);
    expect(recheckItems(d, answer({ dialog: null }))).toEqual({
      error: 'the dialog didn’t open, so it couldn’t be checked',
    });
  });

  it('a replay that failed is a reason, never a pass', () => {
    const r: Recheck = { kind: 'keyboard', route: '/', steps: [] };
    expect(recheckItems(r, answer({ ok: false, error: 'boom' }))).toEqual({
      error: 'the check couldn’t run: boom',
    });
  });
});

describe('the pipeline verifies navigation and keyboard fixes on the worktree', () => {
  const finding = (over: Partial<Finding> = {}): Finding => ({
    id: 'nav',
    runId: 'run-1',
    severity: 3,
    lens: 'usability',
    title: 'Refreshing the page breaks it',
    finding: 'x',
    fix: 'y',
    route: '/cart',
    agreement: { agreeing: 1, total: 5, who: ['Probe'] },
    evidence: [],
    stepIndex: 1,
    atMs: 0,
    status: 'open',
    lane: 'shown',
    ...over,
  });
  const refresh: Recheck = {
    kind: 'refresh',
    route: '/cart',
    expectedHeadings: ['Your cart'],
    needsFlow: false,
  };

  function harness(replays: ReplayAnswer[], title: string) {
    let state = {
      runId: 'run-1',
      mode: 'autonomous',
      findings: [finding({ title })],
      changes: [],
      chat: [],
      fixingCount: 0,
    } as unknown as RunState;
    const calls: FixCall[] = [];
    const site = {
      fix: (call: FixCall) => {
        calls.push(call);
        if (call.fn === 'prepare')
          return Promise.resolve({ job: 'j', branch: 'fitts/run-run-1', sha: 'base' });
        if (call.fn === 'patch') return Promise.resolve({ ok: true });
        if (call.fn === 'replay') return Promise.resolve(replays.shift() ?? answer());
        if (call.fn === 'diff') return Promise.resolve('');
        if (call.fn === 'commit') return Promise.resolve({ ok: true, sha: 'c1' });
        return Promise.resolve(undefined);
      },
    } as unknown as Site;
    const check: Check = { probe: 'navigation', title, routes: ['/cart'], hrefs: [] };
    const pipeline = new FixPipeline(
      {
        state: () => state,
        emit: (events: RunEvent[]) => {
          for (const e of events) state = reduce(state, e) ?? state;
        },
        say: () => undefined,
        id: () => `i-${Math.random()}`,
        ask: () => Promise.resolve(true),
        baseline: () => [],
        costOf: () => 0,
        idle: () => undefined,
        restingActivity: () => 'acting',
        recheck: (id) => (id === 'nav' ? refresh : undefined),
      },
      site,
      async (_t, tools) => {
        await tools.patch('src/a.tsx', 'a', 'b');
        return { patched: 1, summary: 'ok' };
      },
      new Map([['nav', check]]),
    );
    const wait = async () => {
      for (let i = 0; i < 200 && pipeline.busy; i++) await new Promise((r) => setTimeout(r, 2));
    };
    return { pipeline, calls, state: () => state, wait, check };
  }

  // The template's title for a refresh problem.
  const title = titleOf('navigation', item('refreshing /cart shows a blank page'));

  it('the same check passes now → verified, with the recheck named in the PR', async () => {
    const h = harness([answer({ facts: facts() })], title);
    expect(h.pipeline.fixable(['nav'])).toEqual(['nav']);
    h.pipeline.start(['nav']);
    await h.wait();
    expect(h.calls.find((c) => c.fn === 'replay')).toMatchObject({ ask: { facts: '/cart' } });
    expect(h.calls.some((c) => c.fn === 'verify')).toBe(false);
    expect(h.state().changes[0]).toMatchObject({ status: 'verified' });
    expect(h.state().changes[0]?.checked).toBeUndefined();
    expect(fixSection(finding({ title }), h.check, 'ok', 'recheck')).toContain(
      `Ran the navigation check again on this branch's dev server: “${title}” is gone`,
    );
  });

  it('still broken → rolled back with the check’s reason', async () => {
    const blank = answer({ facts: facts({ mainText: 2 }) });
    const h = harness([blank, blank, blank, blank], title);
    h.pipeline.start(['nav']);
    await h.wait();
    expect(h.state().changes[0]).toMatchObject({
      status: 'rolled-back',
      reason: `the navigation check still reports “${title}”`,
    });
  });

  it('fixed but something new broke on the page → rolled back', async () => {
    const broke = answer({
      facts: facts(),
      results: [{ probe: 'target-size', pass: false, items: [item('20×20px', 'x')] }],
    });
    const h = harness([broke, broke, broke, broke], title);
    h.pipeline.start(['nav']);
    await h.wait();
    expect(h.state().changes[0]?.status).toBe('rolled-back');
    expect(h.state().changes[0]?.reason).toMatch(/^it caused a new problem/);
  });
});
