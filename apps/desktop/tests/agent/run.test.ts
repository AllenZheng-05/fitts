// @vitest-environment node
import { replay, type CostEvent, type RunEvent, type RunState } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import { ExplorerBrain, type Brain } from '../../src/agent/crawler/brain';
import { BudgetGuard } from '../../src/agent/ledger/budget';
import { CostLedger } from '../../src/agent/ledger/ledger';
import { RealRun } from '../../src/agent/orchestrator/run';
import type { AxNode, AxSnapshot } from '../../src/agent/protocol';
import type { Site } from '../../src/agent/site-client';

/** A tiny app: / links to /b and /login; /b has a field and Save; / has a destructive button. */
type FakeNode = AxNode & { to?: string };
const APP: Record<string, FakeNode[]> = {
  '/': [
    { ref: 'go-b', role: 'button', name: 'Open B', to: '/b' },
    { ref: 'del', role: 'button', name: 'Delete everything' },
    { ref: 'nav-login', role: 'link', name: 'Log in', href: '/login', region: 'nav' },
  ],
  '/b': [
    { ref: 'name', role: 'textbox', name: 'Name', type: 'text' },
    { ref: 'save', role: 'button', name: 'Save' },
    { ref: 'home', role: 'button', name: 'Home', to: '/' },
  ],
  '/login': [{ ref: 'pw', role: 'textbox', name: 'Password', type: 'password' }],
};

function fakeSite(over: Partial<Site> = {}) {
  let path = '/';
  const log: string[] = [];
  let up = true;
  const site: Site & { log: string[]; setUp(v: boolean): void } = {
    log,
    setUp: (v) => (up = v),
    snapshot: () =>
      Promise.resolve<AxSnapshot>({
        url: `http://x${path}`,
        path,
        title: path === '/login' ? 'Log in' : 'App',
        headings: [],
        nodes: (APP[path] ?? []).map(({ to: _to, ...n }) => n),
        hasPassword: path === '/login',
      }),
    screenshot: () => Promise.resolve({ jpegBase64: '', width: 1, height: 1 }),
    navigate: (p) => {
      log.push(`nav ${p}`);
      path = p;
      return Promise.resolve({ path, navigated: true });
    },
    click: (ref) => {
      log.push(`click ${ref}`);
      const node = APP[path]?.find((n) => n.ref === ref);
      if (!node) return Promise.reject(new Error('gone'));
      const before = path;
      if (node.to) path = node.to;
      return Promise.resolve({ path, navigated: path !== before });
    },
    type: (ref, text) => {
      log.push(`type ${ref} ${text}`);
      return Promise.resolve({ path, navigated: false });
    },
    press: () => Promise.resolve({ path, navigated: false }),
    back: () => Promise.resolve({ path, navigated: false }),
    health: () => Promise.resolve({ up, log: ['Error: Cannot find module'] }),
    restart: () => {
      log.push('restart');
      up = true;
      return Promise.resolve(true);
    },
    probes: () => Promise.resolve([]),
    focusSweep: () => Promise.resolve([]),
    viewportSweep: () => Promise.resolve([]),
    value: () => Promise.resolve(null),
    links: () => Promise.resolve({}),
    network: () => Promise.resolve([]),
    ...over,
  };
  return site;
}

const initial = (cap = 20): RunState => ({
  runId: 'run-1',
  projectId: 'demo-chat',
  phase: 'interview',
  activity: 'idle',
  mode: 'ask-unsure',
  step: 0,
  stepEstimate: 0,
  elapsedMs: 0,
  routes: [],
  controlsTried: { done: 0, total: 0 },
  findings: [],
  changes: [],
  chat: [{ id: 'i1', type: 'fitts.message', text: 'Hi' }],
  queued: [],
  overlays: { problems: [] },
  fixingCount: 0,
  cost: {
    spentUsd: 0,
    capUsd: cap,
    byPhase: { fixes: 0, reviewers: 0, crawling: 0, summing: 0, media: 0 },
  },
  brief: { for: 'Testing' },
  fittsTyping: false,
  driverClicks: [],
});

function setup({
  site = fakeSite(),
  brain = new ExplorerBrain(),
  cap = 20,
}: { site?: ReturnType<typeof fakeSite>; brain?: Brain; cap?: number } = {}) {
  const events: RunEvent[] = [];
  const ledger = new CostLedger();
  const run = new RealRun(initial(cap), {
    site,
    brain,
    ledger,
    budget: new BudgetGuard(),
    origin: 'http://x',
    emit: (e) => events.push(...e),
    actionDelayMs: 0,
  });
  return { run, site, events, ledger, state: () => replay(events) };
}

const until = async (cond: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

const card = (s: RunState | undefined, kind: string) =>
  s?.chat.find((c) => c.type === 'state' && c.stateKind === kind && c.answer === undefined);

describe('RealRun crawl (coverage gate)', () => {
  it('reaches every route, tries every primary control, skips the destructive one, and ends', async () => {
    const { run, site, state } = setup();
    run.start();
    await until(() => Boolean(card(state(), 'login-wall')));
    run.answer(card(state(), 'login-wall')?.id ?? '', 'skip');
    await until(() => Boolean(card(state(), 'nothing-found')));
    const s = state();
    expect(s?.routes.map((r) => r.path)).toEqual(['/', '/b', '/login']);
    expect(s?.routes.every((r) => r.status === 'done')).toBe(true);
    expect(s?.controlsTried.done).toBe(s?.controlsTried.total);
    expect(site.log).not.toContain('click del');
    expect(site.log).toContain('type name fitts-test message');
    // The replayed log equals the run's own state.
    expect(JSON.parse(JSON.stringify(s))).toEqual(JSON.parse(JSON.stringify(run.state)));
    run.answer(card(s, 'nothing-found')?.id ?? '', 'finish');
    expect(state()?.phase).toBe('done');
  });
});

describe('RealRun controls', () => {
  it('takes no steps while the user has the wheel, and resumes on hand-back', async () => {
    const { run, state } = setup();
    run.start();
    await until(() => (state()?.step ?? 0) >= 1);
    run.takeWheel();
    await new Promise((r) => setTimeout(r, 30));
    const step = state()?.step ?? 0;
    run.recordUserClick('Open B');
    await new Promise((r) => setTimeout(r, 60));
    expect(state()?.step).toBe(step);
    expect(state()?.activity).toBe('user-driving');
    run.handBack();
    expect(state()?.chat.some((c) => c.type === 'fitts.message' && c.text.includes('Open B'))).toBe(
      true,
    );
    await until(() => (state()?.step ?? 0) > step);
    run.dispose();
  });

  it('pauses at the step boundary and resumes', async () => {
    const { run, state } = setup();
    run.start();
    await until(() => (state()?.step ?? 0) >= 1);
    run.pause();
    await new Promise((r) => setTimeout(r, 30));
    const step = state()?.step ?? 0;
    await new Promise((r) => setTimeout(r, 60));
    expect(state()?.step).toBe(step);
    run.resume();
    await until(() => (state()?.step ?? 0) > step);
    run.dispose();
  });

  it('⌘. aborts the model call in flight and asks what to do', async () => {
    let aborted = false;
    const slow: Brain = {
      next: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            aborted = true;
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    };
    const { run, state } = setup({ brain: slow });
    run.start();
    await new Promise((r) => setTimeout(r, 20));
    run.stopAction();
    await until(() => aborted);
    expect(card(state(), 'stopped')).toBeTruthy();
    expect(state()?.activity).toBe('waiting-on-user');
    run.dispose();
  });

  it('queues messages while acting and delivers them at the next step', async () => {
    const { run, state } = setup();
    run.start();
    await until(() => (state()?.step ?? 0) >= 1);
    run.sendMessage('Check search too');
    await until(
      () =>
        state()?.queued.length === 0 &&
        (state()?.chat.some(
          (c) => c.type === 'fitts.message' && c.text.startsWith('Got your note'),
        ) ??
          false),
    );
    run.dispose();
  });
});

describe('RealRun edge states from real conditions', () => {
  it('site down: the card, then Restart server brings the run back', async () => {
    const site = fakeSite();
    const { run, state } = setup({ site });
    run.start();
    await until(() => (state()?.step ?? 0) >= 1);
    site.setUp(false);
    run.siteDown();
    expect(card(state(), 'site-down')).toBeTruthy();
    run.answer(card(state(), 'site-down')?.id ?? '', 'restart');
    await until(() => site.log.includes('restart') && state()?.activity === 'acting');
    run.dispose();
  });

  it('site down is also caught when the site stops answering mid-crawl', async () => {
    const site = fakeSite({
      snapshot: () => Promise.reject(new Error('net::ERR_CONNECTION_REFUSED')),
    });
    site.setUp(false);
    const { run, state } = setup({ site });
    run.start();
    await until(() => Boolean(card(state(), 'site-down')));
    run.dispose();
  });

  it('api trouble: the card, and retry carries on', async () => {
    const { run, state } = setup();
    run.start();
    await until(() => (state()?.step ?? 0) >= 1);
    run.apiTrouble();
    const c = card(state(), 'api-trouble');
    expect(c).toBeTruthy();
    run.answer(c?.id ?? '', 'retry-now');
    expect(state()?.activity).toBe('acting');
    run.dispose();
  });

  it('budget: real spend past a $0.10 cap warns at 80% and pauses at 100%', () => {
    const { run, state, ledger } = setup({ cap: 0.1 });
    run.start();
    const entry = (usd: number): CostEvent => ({
      ts: '',
      runId: 'run-1',
      projectId: 'demo-chat',
      task: 'crawl',
      phase: 'crawling',
      provider: 'meta',
      model: 'muse-spark-1.3',
      contributor: false,
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      usd,
      latencyMs: 0,
      priceTable: 't',
    });
    ledger.record(entry(0.085));
    expect(card(state(), 'budget-warning')).toBeTruthy();
    expect(state()?.activity).not.toBe('waiting-on-user');
    ledger.record(entry(0.02));
    expect(card(state(), 'budget')).toBeTruthy();
    expect(state()?.activity).toBe('waiting-on-user');
    expect(run.allowed()).toBe(false);
    run.answer(card(state(), 'budget')?.id ?? '', 'add-10');
    expect(state()?.cost.capUsd).toBeCloseTo(10.1);
    expect(run.allowed()).toBe(true);
    run.dispose();
  });
});
