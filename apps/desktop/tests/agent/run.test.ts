// @vitest-environment node
import { replay, type CostEvent, type RunEvent, type RunState } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import { ExplorerBrain, type Brain } from '../../src/agent/crawler/brain';
import { BudgetGuard } from '../../src/agent/ledger/budget';
import { CostLedger } from '../../src/agent/ledger/ledger';
import { RealRun, type RunDeps } from '../../src/agent/orchestrator/run';
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
    { ref: 'go-c', role: 'button', name: 'Open C', to: '/c' },
  ],
  '/c': [{ ref: 'c-home', role: 'button', name: 'Home again', to: '/' }],
  '/login': [{ ref: 'pw', role: 'textbox', name: 'Password', type: 'password' }],
};

function fakeSite(over: Partial<Site> = {}) {
  let path = '/';
  const log: string[] = [];
  let up = true;
  const site: Site & {
    log: string[];
    setUp(v: boolean): void;
    /** Main holding a write from a destructive tap (set by the test once the run exists). */
    onHeld?: (ref: string) => void;
  } = {
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
    click: (ref, destructive) => {
      log.push(`click ${ref}`);
      const node = APP[path]?.find((n) => n.ref === ref);
      if (!node) return Promise.reject(new Error('gone'));
      if (destructive) site.onHeld?.(ref);
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
    release: (id, allow) => {
      log.push(`release ${id} ${allow ? 'allow' : 'deny'}`);
      return Promise.resolve();
    },
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
  mode = 'ask-unsure',
  themeFit,
  origin = 'http://x',
}: {
  site?: ReturnType<typeof fakeSite>;
  brain?: Brain;
  cap?: number;
  mode?: RunState['mode'];
  themeFit?: RunDeps['themeFit'];
  origin?: string;
} = {}) {
  const events: RunEvent[] = [];
  const ledger = new CostLedger();
  const run = new RealRun(
    { ...initial(cap), mode },
    {
      ...(themeFit ? { themeFit } : {}),
      site,
      brain,
      ledger,
      budget: new BudgetGuard(),
      origin,
      emit: (e) => events.push(...e),
      actionDelayMs: 0,
    },
  );
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
  it('reaches every route, tries every primary control (destructive ones through the gate), and ends', async () => {
    const { run, site, state } = setup();
    run.start();
    await until(() => Boolean(card(state(), 'login-wall')));
    run.answer(card(state(), 'login-wall')?.id ?? '', 'skip');
    // With probe findings (here: no back or cancel control on /c) the run ends on its own.
    await until(() => state()?.phase === 'done');
    const s = state();
    expect(s?.routes.map((r) => r.path)).toEqual(['/', '/b', '/c', '/login']);
    expect(s?.routes.every((r) => r.status === 'done')).toBe(true);
    expect(s?.controlsTried.done).toBe(s?.controlsTried.total);
    // P8: no longer skipped; the tap goes through the gate (its write would be held).
    expect(site.log).toContain('click del');
    expect(site.log).toContain('type name fitts-test message');
    // The replayed log equals the run's own state.
    expect(JSON.parse(JSON.stringify(s))).toEqual(JSON.parse(JSON.stringify(run.state)));
    expect(s?.findings.map((f) => f.title)).toEqual(['No back or cancel in this flow']);
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

/** The fake app's /login comes before /c: skip it so the crawl reaches a third page. */
async function skipLogin(state: () => RunState | undefined, run: RealRun) {
  await until(() => Boolean(card(state(), 'login-wall')));
  run.answer(card(state(), 'login-wall')?.id ?? '', 'skip');
}

describe('theme-fit (§8.3)', () => {
  const verdict = {
    fits: false,
    why: 'Hot pink and confetti read as celebratory.',
    directions: ['Quiet stone', 'Soft linen', 'Evening'].map((name, i) => ({
      id: ['a', 'b', 'c'][i] ?? 'a',
      name,
      swatches: ['#f4f1ec', '#2f3a3a'],
      typeface: 'Source Serif 4',
      notes: 'Quiet and warm.',
    })),
  };

  it('asks once after 3 routes, then posts the lookfeel card and 3 directions; picking one acknowledges it', async () => {
    const asks: number[] = [];
    const { run, state } = setup({
      themeFit: (input) => {
        asks.push(input.shots.length);
        return Promise.resolve(verdict);
      },
    });
    run.start();
    await skipLogin(state, run);
    await until(() => Boolean(state()?.chat.some((c) => c.type === 'directions')));
    expect(asks).toEqual([3]);
    const lookfeel = state()?.chat.find((c) => c.type === 'lookfeel');
    expect(lookfeel).toMatchObject({ text: verdict.why });
    run.pickDirection('b');
    const directions = state()?.chat.find((c) => c.type === 'directions');
    expect(directions).toMatchObject({ selectedId: 'b' });
    expect(state()?.chat.at(-1)).toMatchObject({ text: 'Going with Soft linen: Quiet and warm.' });
    run.dispose();
  });

  it('Autonomous picks the first direction on its own; a fit posts nothing', async () => {
    const auto = setup({ mode: 'autonomous', themeFit: () => Promise.resolve(verdict) });
    auto.run.start();
    await skipLogin(auto.state, auto.run);
    await until(() =>
      Boolean(auto.state()?.chat.some((c) => c.type === 'directions' && c.selectedId === 'a')),
    );
    auto.run.dispose();

    const fits = setup({
      themeFit: () => Promise.resolve({ fits: true, why: 'Calm.', directions: [] }),
    });
    fits.run.start();
    await skipLogin(fits.state, fits.run);
    await until(() => fits.state()?.phase === 'done');
    expect(fits.state()?.chat.some((c) => c.type === 'lookfeel')).toBe(false);
    fits.run.dispose();
  });
});

describe('the permission gate and modes (§13)', () => {
  /** Main holds the DELETE that "Delete everything" sends. */
  const withGate = (run: RealRun, site: ReturnType<typeof fakeSite>) => {
    site.onHeld = () => run.held({ id: 'h1', method: 'DELETE', url: 'http://x/api/items/1' });
  };

  it('holds the DELETE from a destructive tap until the user answers; Don’t do it fails it', async () => {
    const { run, site, state } = setup();
    withGate(run, site);
    run.start();
    await until(() => Boolean(state()?.gate));
    expect(state()?.gate).toMatchObject({
      action: 'Delete everything',
      route: '/',
      heldRequest: 'DELETE /api/items/1',
    });
    expect(state()?.activity).toBe('waiting-on-user');
    const step = state()?.step ?? 0;
    await new Promise((r) => setTimeout(r, 50));
    expect(state()?.step).toBe(step); // nothing else happens while the gate is open
    expect(site.log.filter((l) => l.startsWith('release'))).toEqual([]);
    run.respondGate(state()?.gate?.id ?? '', 'deny');
    expect(site.log).toContain('release h1 deny');
    expect(state()?.gate).toBeUndefined();
    expect(
      state()?.chat.some(
        (c) => c.type === 'fitts.message' && c.text === "Okay, I won't tap it. Moving on.",
      ),
    ).toBe(true);
    await until(() => (state()?.step ?? 0) > step);
    run.dispose();
  });

  it('Allow once sends it; Dangerous mode on localhost sends it without asking', async () => {
    const allow = setup();
    withGate(allow.run, allow.site);
    allow.run.start();
    await until(() => Boolean(allow.state()?.gate));
    allow.run.respondGate(allow.state()?.gate?.id ?? '', 'allow');
    expect(allow.site.log).toContain('release h1 allow');
    allow.run.dispose();

    const danger = setup({ mode: 'dangerous', origin: 'http://localhost:5173' });
    withGate(danger.run, danger.site);
    danger.run.start();
    await until(() => danger.site.log.includes('release h1 allow'));
    expect(danger.state()?.gate).toBeUndefined();
    danger.run.dispose();
  });

  it('Dangerous mode off localhost still asks', async () => {
    const remote = setup({ mode: 'dangerous', origin: 'https://example.com' });
    withGate(remote.run, remote.site);
    remote.run.start();
    await until(() => Boolean(remote.state()?.gate));
    remote.run.dispose();
    expect(remote.site.log).toContain('release h1 deny');
  });

  it('Ask every action asks before each tap; Skip it skips that control', async () => {
    const { run, site, state } = setup({ mode: 'ask-every' });
    run.start();
    const question = () =>
      state()?.chat.find((c) => c.type === 'question' && c.answer === undefined);
    await until(() => Boolean(question()));
    expect(question()).toMatchObject({
      text: 'Can I tap Open B?',
      options: ['Go ahead', 'Skip it'],
    });
    expect(site.log.some((l) => l.startsWith('click'))).toBe(false);
    run.answer(question()?.id ?? '', 'Skip it');
    await until(() => Boolean(question()));
    expect(site.log.some((l) => l.startsWith('click'))).toBe(false);
    run.answer(question()?.id ?? '', 'Go ahead');
    await until(() => site.log.some((l) => l.startsWith('click')));
    run.dispose();
  });

  it('Plan only never clicks or types', async () => {
    const { run, site, state } = setup({ mode: 'plan' });
    run.start();
    await until(() => Boolean(card(state(), 'login-wall')) || state()?.phase === 'done');
    expect(site.log.some((l) => l.startsWith('click') || l.startsWith('type'))).toBe(false);
    expect(
      state()?.chat.some((c) => c.type === 'fitts.message' && c.text.includes('Plan only')),
    ).toBe(true);
    run.dispose();
  });
});
