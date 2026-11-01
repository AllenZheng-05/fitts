// @vitest-environment node
import { replay, type CostEvent, type RunEvent, type RunState } from '@fitts/schema';
import { testDirection } from './design';
import { describe, expect, it } from 'vitest';
import { ExplorerBrain, type Brain } from '../../src/agent/crawler/brain';
import { BudgetGuard } from '../../src/agent/ledger/budget';
import { CostLedger } from '../../src/agent/ledger/ledger';
import { RealRun, type RunDeps } from '../../src/agent/orchestrator/run';
import type { AxNode, AxSnapshot } from '../../src/agent/protocol';
import {
  scriptedNext,
  type Decision,
  type Situation,
} from '../../src/agent/orchestrator/abilities';
import type { Site } from '../../src/agent/site-client';
import { copy } from '../../src/renderer/copy';

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
    fix: () => Promise.reject(new Error('no fixes in this fake')),
    rects: () => Promise.resolve({}),
    png: (jpeg) => Promise.resolve(jpeg),
    saveAsset: (runId, name) => Promise.resolve(`fitts-asset://demo-chat/${runId}/assets/${name}`),
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
  maxSteps,
  decider,
  converse,
  reviseLooks,
  themeFit,
  origin = 'http://localhost:5173',
  media,
  fixer,
  redesigner,
}: {
  site?: ReturnType<typeof fakeSite>;
  brain?: Brain;
  cap?: number;
  mode?: RunState['mode'];
  maxSteps?: number;
  decider?: RunDeps['decider'];
  converse?: RunDeps['converse'];
  reviseLooks?: RunDeps['reviseLooks'];
  themeFit?: RunDeps['themeFit'];
  origin?: string;
  media?: RunDeps['media'];
  fixer?: RunDeps['fixer'];
  redesigner?: RunDeps['redesigner'];
} = {}) {
  const events: RunEvent[] = [];
  const ledger = new CostLedger();
  const run = new RealRun(
    { ...initial(cap), mode },
    {
      ...(themeFit ? { themeFit } : {}),
      ...(media ? { media } : {}),
      ...(fixer ? { fixer } : {}),
      ...(redesigner ? { redesigner } : {}),
      ...(maxSteps ? { maxSteps } : {}),
      ...(decider ? { decider } : {}),
      ...(converse ? { converse } : {}),
      ...(reviseLooks ? { reviseLooks } : {}),
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
    const before = state()?.step ?? 0;
    run.answer(card(state(), 'site-down')?.id ?? '', 'restart');
    // The crawl carries on: it takes more steps (a fast machine can finish before a poll
    // ever sees activity 'acting').
    await until(() => site.log.includes('restart') && (state()?.step ?? 0) > before);
    run.dispose();
  });

  it('site down names the real site: a dev server’s own lines, or a live site with no server', () => {
    const local = setup();
    local.run.start();
    local.run.siteDown(['Error: Cannot find module "./Nav"']);
    expect(card(local.state(), 'site-down')).toMatchObject({
      detail: { url: 'localhost:5173', live: false, log: ['Error: Cannot find module "./Nav"'] },
    });
    local.run.dispose();
    const live = setup({ origin: 'https://openteamsheets.com' });
    live.run.start();
    live.run.siteDown();
    expect(card(live.state(), 'site-down')).toMatchObject({
      detail: { url: 'openteamsheets.com', live: true },
    });
    live.run.dispose();
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

const review = (s: RunState | undefined) => s?.chat.find((c) => c.type === 'review');

describe('style boards (SPEC-phase3 §2)', () => {
  it('each direction gets a board in the site’s words, with its fonts, posted on its option', async () => {
    const boards: { name: string; html: string; fonts: string[] }[] = [];
    const site = fakeSite({
      board: (_runId, name, html, fonts) => {
        boards.push({ name, html, fonts: fonts.map((f) => f.family) });
        return Promise.resolve(`fitts-asset://demo-chat/run-1/assets/${name}`);
      },
    });
    const { run, state } = setup({
      site,
      themeFit: () =>
        Promise.resolve({
          fits: false,
          why: 'Too loud.',
          directions: [testDirection('a', 'Quiet stone'), testDirection('b', 'Soft linen')],
        }),
    });
    run.start();
    await skipLogin(state, run);
    await until(() => {
      const item = state()?.chat.find((c) => c.type === 'directions');
      return item?.type === 'directions' && item.options.every((o) => o.board);
    }, 10_000);
    const item = state()?.chat.find((c) => c.type === 'directions');
    expect(item?.type === 'directions' && item.options.map((o) => o.board)).toEqual([
      'fitts-asset://demo-chat/run-1/assets/board-a.html',
      'fitts-asset://demo-chat/run-1/assets/board-b.html',
    ]);
    expect(boards[0]?.html).toContain('Quiet stone');
    expect(boards[0]?.fonts.length).toBeGreaterThan(0);
    run.dispose();
  });
});

/** A project that can be fixed and redesigned: its fix calls answer like main would. */
const redesignable = () => {
  const calls: string[] = [];
  const site = fakeSite({
    fix: (call) => {
      calls.push(call.fn);
      if (call.fn === 'available') return Promise.resolve({ ok: true });
      if (call.fn === 'prepare') return Promise.resolve({ job: 'j', branch: call.branch });
      if (call.fn === 'verifyPages')
        return Promise.resolve({
          ok: true,
          pages: call.routes.map((route) => ({
            route,
            loaded: true,
            results: [],
            focus: [],
            viewport: [],
            jpegBase64: 'AFTER',
          })),
        });
      if (call.fn === 'prOpen') return Promise.resolve({ number: 7, url: 'dry-run://pr/7' });
      return Promise.resolve({ ok: true });
    },
  });
  const redesigner: RunDeps['redesigner'] = async (_task, tools) => {
    await tools.write('src/theme.css', ':root{}');
    return { patched: 1, summary: 'Restyled it.', wording: [] };
  };
  const fixer: RunDeps['fixer'] = () => Promise.resolve({ patched: 0, summary: '' });
  return { site, calls, redesigner, fixer };
};

describe('theme-fit (§8.3)', () => {
  const verdict = {
    fits: false,
    why: 'Hot pink and confetti read as celebratory.',
    directions: ['Quiet stone', 'Soft linen', 'Evening'].map((name, i) =>
      testDirection(['a', 'b', 'c'][i] ?? 'a', name),
    ),
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

  it('a live site (no code) gets the lookfeel note but no directions to pick', async () => {
    const { run, state } = setup({
      origin: 'https://openteamsheets.com',
      themeFit: () => Promise.resolve(verdict),
    });
    run.start();
    await skipLogin(state, run);
    await until(() => Boolean(state()?.chat.some((c) => c.type === 'lookfeel')));
    await new Promise((r) => setTimeout(r, 50));
    expect(state()?.chat.some((c) => c.type === 'directions')).toBe(false);
    expect(
      state()?.chat.some(
        (c) => c.type === 'fitts.message' && /only look at a live site/.test(c.text),
      ),
    ).toBe(true);
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

  /** A repo the redesign can change: main's side answers every fix call. */

  it('Ask modes: after the review it asks which look; a pick restyles every page in one PR', async () => {
    const r = redesignable();
    const { run, state } = setup({
      site: r.site,
      fixer: r.fixer,
      redesigner: r.redesigner,
      themeFit: () => Promise.resolve(verdict),
    });
    run.start();
    await skipLogin(state, run);
    const question = () =>
      state()?.chat.find((c) => c.type === 'question' && c.text === copy.fitts.whichLook);
    await until(() => Boolean(question()));
    expect(state()?.waitingFor).toBe(`question:${question()?.id ?? ''}`);
    run.pickDirection('b');
    // The final review (SPEC-phase3 §2.4): the PR waits for "It's good".
    await until(() => Boolean(review(state())));
    expect(state()?.changes.find((c) => c.kind === 'redesign')?.prNumber).toBeUndefined();
    expect(state()?.waitingFor).toBe(`question:${review(state())?.id ?? ''}`);
    run.answer(review(state())?.id ?? '', 'ok');
    await until(() => state()?.phase === 'done');
    expect(review(state())?.answer).toBe('ok');
    const change = state()?.changes.find((c) => c.kind === 'redesign');
    expect(change).toMatchObject({
      title: 'Redesign: Soft linen',
      status: 'verified',
      prNumber: 7,
    });
    expect(change?.pages?.length).toBeGreaterThan(1);
    expect(r.calls.filter((c) => c === 'verifyPages')).toHaveLength(1);
    expect(question()).toMatchObject({ answer: 'Soft linen' });
    run.dispose();
  });

  it('“Keep my look” skips the redesign', async () => {
    const r = redesignable();
    const keep = setup({
      site: r.site,
      fixer: r.fixer,
      redesigner: r.redesigner,
      themeFit: () => Promise.resolve(verdict),
    });
    keep.run.start();
    await skipLogin(keep.state, keep.run);
    await until(() =>
      Boolean(
        keep.state()?.chat.some((c) => c.type === 'question' && c.text === copy.fitts.whichLook),
      ),
    );
    const q = keep
      .state()
      ?.chat.find((c) => c.type === 'question' && c.text === copy.fitts.whichLook);
    keep.run.answer(q?.id ?? '', copy.fitts.keepLook);
    await until(() => keep.state()?.phase === 'done');
    expect(r.calls).not.toContain('prepare');
    keep.run.dispose();
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
      options: ['Allow once', 'Allow on this page', 'Allow everything this run', 'Skip it'],
    });
    expect(site.log.some((l) => l.startsWith('click'))).toBe(false);
    run.answer(question()?.id ?? '', 'Skip it');
    await until(() => Boolean(question()));
    expect(site.log.some((l) => l.startsWith('click'))).toBe(false);
    run.answer(question()?.id ?? '', 'Allow once');
    await until(() => site.log.some((l) => l.startsWith('click')));
    // Every action shows in the chat, in one group.
    await until(() => Boolean(state()?.chat.some((c) => c.type === 'steps')));
    run.dispose();
  });

  it('Ask every action: "Allow everything this run" stops asking', async () => {
    const { run, site, state } = setup({ mode: 'ask-every' });
    run.start();
    const question = () =>
      state()?.chat.find((c) => c.type === 'question' && c.answer === undefined);
    await until(() => Boolean(question()));
    run.answer(question()?.id ?? '', 'Allow everything this run');
    await until(() => site.log.filter((l) => l.startsWith('click')).length >= 2);
    expect(state()?.chat.filter((c) => c.type === 'question')).toHaveLength(1);
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

describe('media (§10)', () => {
  it('outlines each shown finding’s element with SAM, as an asset, and draws no fix mockups', async () => {
    const outlines: { box: unknown }[] = [];
    const edits: string[] = [];
    const media = {
      outline: (_ctx: unknown, _shot: unknown, box: unknown) => {
        outlines.push({ box });
        return Promise.resolve('M0 0 L10 0 L10 10 Z');
      },
      edit: (_ctx: unknown, _png: string, prompt: string) => {
        edits.push(prompt);
        return Promise.resolve('UE5H');
      },
    };
    const site = fakeSite({
      probes: () =>
        Promise.resolve([
          {
            probe: 'target-size' as const,
            pass: false,
            items: [
              { ref: 'go-b', selector: '', measured: '28×20px', expected: 'at least 24×24px' },
            ],
          },
        ]),
      rects: () => Promise.resolve({ 'go-b': { left: 10, top: 20, width: 28, height: 20 } }),
    });
    const { run, state } = setup({ site, media: media as never });
    run.start();
    await skipLogin(state, run);
    await until(() =>
      Boolean(state()?.findings.find((f) => f.title === 'Tap target is too small')?.assets?.mask),
    );
    const f = state()?.findings.find((x) => x.title === 'Tap target is too small');
    // The fix panel shows the real fixed site, so a finding gets no Muse Image picture.
    expect(f?.assets).toEqual({
      shot: 'fitts-asset://demo-chat/run-1/assets/shot-_.jpg',
      mask: `fitts-asset://demo-chat/run-1/assets/mask-${f?.id ?? ''}.svg`,
    });
    expect(outlines[0]?.box).toEqual({ left: 10, top: 20, width: 28, height: 20 });
    expect(edits).toEqual([]);
    run.dispose();
  });
});

describe('Done: replays and the step cap (Allen’s feedback, round 4)', () => {
  it('a finding replays the steps from opening its page to using its element', async () => {
    const site = fakeSite({
      probes: () =>
        Promise.resolve([
          {
            probe: 'target-size' as const,
            pass: false,
            items: [
              { ref: 'go-b', selector: '', measured: '28×20px', expected: 'at least 24×24px' },
            ],
          },
        ]),
    });
    const { run, state } = setup({ site });
    run.start();
    await skipLogin(state, run);
    await until(() =>
      Boolean(state()?.findings.find((f) => f.title === 'Tap target is too small')),
    );
    const f = state()?.findings.find((x) => x.title === 'Tap target is too small');
    expect(f?.replay?.at(-1)?.label).toBe('Tapped “Open B” → /b');
    expect(f?.stepIndex).toBe(f?.replay?.at(-1)?.step);
    run.dispose();
  });

  it('stopping at the step ceiling says so, with what was left', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ref: `b${i}`,
      role: 'button',
      name: `Button ${i}`,
    }));
    const site = fakeSite({
      snapshot: () =>
        Promise.resolve({
          url: 'http://x/',
          path: '/',
          title: 'App',
          headings: [],
          nodes: many,
          hasPassword: false,
        }),
      click: () => Promise.resolve({ path: '/', navigated: false }),
    });
    const { run, state } = setup({ site, maxSteps: 20 });
    run.start();
    const said = () =>
      state()?.chat.find(
        (c) => c.type === 'fitts.message' && c.text.startsWith('I stopped testing at 20 steps'),
      );
    await until(() => Boolean(said()), 10_000);
    const line = said();
    expect(line?.type === 'fitts.message' && line.text).toContain(
      '10 controls on 1 page weren’t tried',
    );
    run.dispose();
  });

  it('going in circles on a page skips what’s left there; everywhere, it ends the crawl', async () => {
    // A brain that taps the same already-tried button forever.
    const stuck: Brain = {
      next: ({ snapshot }) =>
        Promise.resolve(
          snapshot.path === '/'
            ? { kind: 'click', ref: 'del', name: 'Delete everything', why: 'again' }
            : { kind: 'navigate', path: '/', why: 'back' },
        ),
    };
    const site = fakeSite({ click: () => Promise.resolve({ path: '/', navigated: false }) });
    const { run, state } = setup({ site, brain: stuck, mode: 'autonomous' });
    run.start();
    const lines = () =>
      state()?.chat.flatMap((c) => (c.type === 'fitts.message' ? [c.text] : [])) ?? [];
    await until(() => lines().some((t) => t.startsWith('I’m going in circles on /')));
    // What was left on / counts as covered (skipped), so the crawl can move on.
    expect(state()?.controlsTried).toEqual({ done: 2, total: 2 });
    await until(() => lines().some((t) => t.startsWith('I’ve stopped finding anything new')));
    // Nothing was found on this fake, so Fitts asks whether to finish; the run ends on "finish".
    await until(() => Boolean(card(state(), 'nothing-found')));
    run.answer(card(state(), 'nothing-found')?.id ?? '', 'finish');
    await until(() => state()?.phase === 'done');
    run.dispose();
  });
});

describe('the guarantees hold against a hostile decider (SPEC-phase3 §1.6)', () => {
  /** A decider that always asks for one thing, and records what it saw. */
  const always = (ability: string) => {
    const seen: { ended: boolean; recent: string[] }[] = [];
    return {
      seen,
      next: (s: {
        coverage: { ended: boolean };
        recent: { ability: string; result: string }[];
      }) => {
        seen.push({
          ended: s.coverage.ended,
          recent: s.recent.map((o) => `${o.ability}:${o.result}`),
        });
        return Promise.resolve({ ability } as never);
      },
    };
  };

  it('finish is refused while pages and controls are left; the run still covers everything', async () => {
    const decider = always('finish');
    const { run, state } = setup({ decider: decider });
    run.start();
    await skipLogin(state, run);
    await until(() => state()?.phase === 'done', 10_000);
    const s = state();
    expect(s?.controlsTried.done).toBe(s?.controlsTried.total);
    expect(decider.seen.some((x) => x.recent.includes('finish:refused'))).toBe(true);
    run.dispose();
  });

  it('a live site refuses fixes, however often they are asked for', async () => {
    const decider = always('fix');
    const { run, state } = setup({ decider: decider, origin: 'https://example.com' });
    run.start();
    await skipLogin(state, run);
    await until(() => state()?.phase === 'done', 10_000);
    expect(decider.seen.some((x) => x.recent.includes('fix:refused'))).toBe(true);
    expect(state()?.chat.some((c) => c.type === 'approval.batch')).toBe(false);
    run.dispose();
  }, 20_000);

  it('a decider that throws falls back to the scripted order and the run finishes', async () => {
    const { run, state } = setup({
      decider: { next: () => Promise.reject(new Error('model down')) },
    });
    run.start();
    await skipLogin(state, run);
    await until(() => state()?.phase === 'done', 10_000);
    expect(state()?.controlsTried.done).toBe(state()?.controlsTried.total);
    run.dispose();
  });
});

describe('the owner steers (SPEC-phase3 §1.3, §1.4)', () => {
  /**
   * A decider that does what the scripted one would, except for what the owner asks: "skip
   * /c" skips it, "look at /c" opens it, "not a problem" while pointing dismisses it. After the
   * review it waits for a message, so a test can steer then.
   */
  const listening = (waitAfterReview = false) => ({
    seen: [] as string[][],
    next(s: Situation) {
      this.seen.push(s.messages);
      for (const m of s.messages) {
        if (/skip \/c/.test(m))
          return Promise.resolve<Decision>({
            ability: 'skip_pages',
            paths: ['/c'],
            say: 'Skipping /c.',
          });
        if (/look at \/c/.test(m))
          return Promise.resolve({
            ability: 'explore',
            route: '/c',
            say: 'Opening /c next.',
          } as Decision);
        const ref = /pointing at ref (\S+?)[:\]]/.exec(m)?.[1];
        if (/not a problem/.test(m) && ref)
          return Promise.resolve({ ability: 'dismiss', ref } as Decision);
      }
      if (waitAfterReview && s.ran.review && !s.recent.some((o) => o.ability === 'dismiss'))
        return new Promise<Decision>((r) => setTimeout(() => r({ ability: 'check_theme' }), 10));
      return Promise.resolve({ ability: scriptedNext(s) });
    },
  });

  it('“skip /c” skips that page: its controls are never tried, and Fitts says so', async () => {
    const decider = listening();
    const { run, site, state } = setup({ decider });
    run.start();
    run.sendMessage('please skip /c');
    await skipLogin(state, run);
    await until(() => state()?.phase === 'done', 10_000);
    expect(state()?.routes.find((r) => r.path === '/c')).toMatchObject({
      status: 'done',
      label: 'skipped',
    });
    expect(site.log).not.toContain('click c-home');
    expect(state()?.chat.some((c) => c.type === 'fitts.message' && c.text === 'Skipping /c.')).toBe(
      true,
    );
    run.dispose();
  });

  it('“look at /c” opens it next, within one step of saying so', async () => {
    const decider = listening();
    const { run, site } = setup({ decider });
    run.start();
    await until(() => site.log.length >= 1);
    const at = site.log.length;
    run.sendMessage('look at /c next');
    await until(() => site.log.includes('nav /c'), 3000);
    // One step to finish what it was doing, then /c.
    expect(site.log.indexOf('nav /c') - at).toBeLessThanOrEqual(2);
    run.dispose();
  });

  it('“not a problem” while pointing dismisses the finding on that element', async () => {
    const decider = listening(true);
    const site = fakeSite({
      probes: () =>
        Promise.resolve([
          {
            probe: 'target-size' as const,
            pass: false,
            items: [
              { ref: 'go-b', selector: '', measured: '28×20px', expected: 'at least 24×24px' },
            ],
          },
        ]),
    });
    const { run, state } = setup({ site, decider });
    run.start();
    await skipLogin(state, run);
    await until(() => Boolean(state()?.findings.find((f) => f.elementRef === 'go-b')), 10_000);
    run.sendMessage('that’s not a problem', {
      pointingAt: 'go-b',
      pointingLabel: '“Open B” button',
    });
    await until(
      () => state()?.findings.find((f) => f.elementRef === 'go-b')?.status === 'dismissed',
      3000,
    );
    run.dispose();
  });

  it('every message gets a reply from converse while the work goes on, and no canned line', async () => {
    const asked: string[] = [];
    const converse = (input: { message: string; now: string }) => {
      asked.push(`${input.message} | ${input.now}`);
      return Promise.resolve('The nav reads well, but its labels are small.');
    };
    const { run, state } = setup({ converse: converse });
    run.start();
    run.sendMessage('what do you think of the nav?');
    await until(() =>
      Boolean(
        state()?.chat.some(
          (c) =>
            c.type === 'fitts.message' &&
            c.text === 'The nav reads well, but its labels are small.',
        ),
      ),
    );
    expect(asked[0]).toMatch(/^what do you think of the nav\? \| /);
    expect(
      state()?.chat.some(
        (c) => c.type === 'fitts.message' && /keep (that|them) in mind/.test(c.text),
      ),
    ).toBe(false);
    run.dispose();
  });

  it('a live site refuses a new look', async () => {
    const decider = {
      asked: false,
      next(s: Situation) {
        if (!this.asked) {
          this.asked = true;
          return Promise.resolve({ ability: 'new_look', wish: 'darker' } as Decision);
        }
        return Promise.resolve({ ability: scriptedNext(s) });
      },
    };
    const outcomes: string[] = [];
    const spy = {
      next: (s: Situation) => {
        outcomes.push(...s.recent.map((o) => `${o.ability}:${o.result}`));
        return decider.next(s);
      },
    };
    const { run, state } = setup({ decider: spy, origin: 'https://example.com' });
    run.start();
    await skipLogin(state, run);
    await until(() => state()?.phase === 'done', 10_000);
    expect(outcomes).toContain('new_look:refused');
    expect(state()?.brief.look).toBeUndefined();
    run.dispose();
  });
});

describe('rounds and the final review (SPEC-phase3 §2.3, §2.4)', () => {
  const directions = (prefix: string) => [
    testDirection(`${prefix}a`, `${prefix} stone`),
    testDirection(`${prefix}b`, `${prefix} linen`),
  ];
  /** Revises on "warmer"; otherwise the scripted order. */
  const reviser = {
    next(s: Situation) {
      const m = s.messages.find((x) => /warmer|none of these/i.test(x));
      if (m) return Promise.resolve<Decision>({ ability: 'revise_looks', wish: m });
      return Promise.resolve<Decision>({ ability: scriptedNext(s) });
    },
  };

  it('feedback on the directions makes round 2, with new ids and boards', async () => {
    const asked: { n: number; feedback: string; previous: string[] }[] = [];
    // A project that can be redesigned, so the run waits for a pick (as the real app does)
    // instead of finishing before the feedback arrives.
    const r = redesignable();
    r.site.board = (_r, name) => Promise.resolve(`fitts-asset://demo-chat/run-1/assets/${name}`);
    const { run, state } = setup({
      site: r.site,
      fixer: r.fixer,
      redesigner: r.redesigner,
      decider: reviser,
      themeFit: () =>
        Promise.resolve({ fits: false, why: 'Too cold.', directions: directions('Cold') }),
      reviseLooks: (input) => {
        asked.push({
          n: input.round.n,
          feedback: input.round.feedback,
          previous: input.round.previous.map((d) => d.name),
        });
        return Promise.resolve(directions('Warm'));
      },
    });
    run.start();
    await skipLogin(state, run);
    await until(
      () =>
        Boolean(
          state()?.chat.find((c) => c.type === 'question' && c.text === copy.fitts.whichLook),
        ),
      10_000,
    );
    run.sendMessage('make them warmer');
    const second = () => state()?.chat.find((c) => c.type === 'directions' && c.round === 2);
    await until(() => {
      const d = second();
      return d?.type === 'directions' && d.options.every((o) => o.board);
    }, 10_000);
    expect(asked).toEqual([
      { n: 2, feedback: 'make them warmer', previous: ['Cold stone', 'Cold linen'] },
    ]);
    const d = second();
    expect(d?.type === 'directions' && d.options.map((o) => o.id)).toEqual([
      'r2-Warma',
      'r2-Warmb',
    ]);
    run.dispose();
  });

  it('a message while Fitts waits for a pick goes to the decider, and a round comes back', async () => {
    const r = redesignable();
    const { run, state } = setup({
      site: r.site,
      fixer: r.fixer,
      redesigner: r.redesigner,
      decider: reviser,
      themeFit: () =>
        Promise.resolve({ fits: false, why: 'Too cold.', directions: directions('Cold') }),
      reviseLooks: () => Promise.resolve(directions('Warm')),
    });
    run.start();
    await skipLogin(state, run);
    const pick = () =>
      state()?.chat.find((c) => c.type === 'question' && c.text === copy.fitts.whichLook);
    await until(() => Boolean(pick()), 10_000);
    run.sendMessage('None of these, warmer please');
    await until(
      () => Boolean(state()?.chat.find((c) => c.type === 'directions' && c.round === 2)),
      10_000,
    );
    expect(pick()).toMatchObject({ answer: 'None of these, warmer please' });
    // Then it asks for a pick again, from round 2.
    await until(
      () =>
        (state()?.chat.filter((c) => c.type === 'question' && c.text === copy.fitts.whichLook)
          .length ?? 0) === 2,
      10_000,
    );
    run.pickDirection('r2-Warmb');
    await until(() => Boolean(review(state())), 10_000);
    run.answer(review(state())?.id ?? '', 'ok');
    await until(() => state()?.phase === 'done', 10_000);
    expect(state()?.changes.find((c) => c.kind === 'redesign')?.title).toBe('Redesign: Warm linen');
    run.dispose();
  });

  it('what the owner says during the review changes the branch before the PR', async () => {
    const r = redesignable();
    const { run, state } = setup({
      site: r.site,
      fixer: r.fixer,
      redesigner: r.redesigner,
      themeFit: () =>
        Promise.resolve({ fits: false, why: 'Too cold.', directions: directions('Cold') }),
    });
    run.start();
    await skipLogin(state, run);
    await until(
      () =>
        Boolean(
          state()?.chat.find((c) => c.type === 'question' && c.text === copy.fitts.whichLook),
        ),
      10_000,
    );
    run.pickDirection('Colda');
    await until(() => Boolean(review(state())), 10_000);
    const before = r.calls.filter((c) => c === 'verifyPages').length;
    run.sendMessage('make the headings bigger');
    await until(() =>
      Boolean(
        state()?.chat.some((c) => c.type === 'fitts.message' && c.text === copy.fitts.reviewAgain),
      ),
    );
    expect(r.calls.filter((c) => c === 'verifyPages').length).toBe(before + 1);
    expect(state()?.changes.find((c) => c.kind === 'redesign')?.prNumber).toBeUndefined();
    run.answer(review(state())?.id ?? '', 'ok');
    await until(() => state()?.phase === 'done', 10_000);
    expect(state()?.changes.find((c) => c.kind === 'redesign')?.prNumber).toBe(7);
    run.dispose();
  });

  it('“Start over” rolls the redesign back and opens the looks again', async () => {
    const r = redesignable();
    const { run, state } = setup({
      site: r.site,
      fixer: r.fixer,
      redesigner: r.redesigner,
      decider: {
        next: (s: Situation) =>
          Promise.resolve<Decision>(
            s.messages.some((m) => m.startsWith('Start over'))
              ? { ability: 'revise_looks', wish: 'none of it works' }
              : { ability: scriptedNext(s) },
          ),
      },
      themeFit: () =>
        Promise.resolve({ fits: false, why: 'Too cold.', directions: directions('Cold') }),
      reviseLooks: () => Promise.resolve(directions('Warm')),
    });
    run.start();
    await skipLogin(state, run);
    await until(
      () =>
        Boolean(
          state()?.chat.find((c) => c.type === 'question' && c.text === copy.fitts.whichLook),
        ),
      10_000,
    );
    run.pickDirection('Colda');
    await until(() => Boolean(review(state())), 10_000);
    run.answer(review(state())?.id ?? '', 'restart');
    await until(
      () => state()?.changes.find((c) => c.kind === 'redesign')?.status === 'rolled-back',
      10_000,
    );
    await until(
      () => Boolean(state()?.chat.find((c) => c.type === 'directions' && c.round === 2)),
      10_000,
    );
    expect(r.calls).toContain('discard');
    expect(state()?.changes.find((c) => c.kind === 'redesign')?.prNumber).toBeUndefined();
    run.dispose();
  });

  it('Autonomous opens the PR and leaves the review open with “Send it back”', async () => {
    const r = redesignable();
    const { run, state } = setup({
      site: r.site,
      fixer: r.fixer,
      redesigner: r.redesigner,
      mode: 'autonomous',
      themeFit: () =>
        Promise.resolve({ fits: false, why: 'Too cold.', directions: directions('Cold') }),
    });
    run.start();
    await skipLogin(state, run);
    await until(() => state()?.changes.find((c) => c.kind === 'redesign')?.prNumber === 7, 10_000);
    expect(review(state())).toMatchObject({ autonomous: true });
    run.answer(review(state())?.id ?? '', 'back');
    expect(review(state())?.answer).toBe('back');
    expect(state()?.chat.at(-1)).toMatchObject({ type: 'fitts.message' });
    run.dispose();
  });
});

describe('fixing what was asked (Allen’s feedback, round 5)', () => {
  /** A fixable tap target on /, through the real pipeline with a fixer that patches. */
  const fixRun = () => {
    const r = redesignable();
    r.site.probes = () =>
      Promise.resolve([
        {
          probe: 'target-size' as const,
          pass: false,
          items: [{ ref: 'go-b', selector: '', measured: '28×20px', expected: 'at least 24×24px' }],
        },
      ]);
    return setup({ site: r.site, fixer: r.fixer, redesigner: r.redesigner });
  };

  it('“Fix it” on a finding outside the batch leaves the batch waiting', async () => {
    const { run, state } = fixRun();
    run.start();
    await skipLogin(state, run);
    await until(() => state()?.waitingFor === 'approval', 10_000);
    const batch = state()?.chat.find((c) => c.type === 'approval.batch');
    const outside = state()?.findings.find(
      (f) => batch?.type === 'approval.batch' && !batch.findingIds.includes(f.id),
    );
    expect(outside).toBeDefined();
    run.approveFixes([outside?.id ?? '']);
    // It says it can't fix that one, and the batch still waits for its own answer.
    expect(
      state()?.chat.some(
        (c) =>
          c.type === 'fitts.message' && c.text.startsWith(`I can’t fix “${outside?.title ?? ''}”`),
      ),
    ).toBe(true);
    expect(state()?.waitingFor).toBe('approval');
    expect(state()?.phase).toBe('audit');
    run.dispose();
  });
  it('“Show me on the site” switches to the size the problem happens at', async () => {
    const devices: (string | null)[] = [];
    const site = fakeSite({
      device: (id) => {
        devices.push(id);
        return Promise.resolve(null);
      },
      viewportSweep: () =>
        Promise.resolve([
          {
            ref: 'e1',
            selector: '',
            measured: 'page is 980px wide at 360px',
            expected: 'no sideways scrolling at 360px',
          },
        ]),
    });
    const { run, state } = setup({ site });
    run.start();
    await skipLogin(state, run);
    await until(() => Boolean(state()?.findings.find((f) => f.seenOn === 'phone')), 10_000);
    const f = state()?.findings.find((x) => x.seenOn === 'phone');
    devices.length = 0;
    await run.showFinding(f?.id ?? '');
    expect(devices).toEqual(['phone']);
    const last = state()?.chat.at(-1);
    expect(last?.type === 'fitts.message' && last.text).toContain(
      'I switched the view to iPhone · 390×844',
    );
    run.dispose();
  });
});

describe('the Finding panel’s evidence (Allen’s feedback, round 5)', () => {
  it('a shown finding gets its page’s shot, the element’s box on it, and the shot’s size', async () => {
    const site = fakeSite({
      screenshot: () => Promise.resolve({ jpegBase64: 'SHOT', width: 1024, height: 700 }),
      probes: () =>
        Promise.resolve([
          {
            probe: 'target-size' as const,
            pass: false,
            items: [
              { ref: 'go-b', selector: '', measured: '28×20px', expected: 'at least 24×24px' },
            ],
          },
        ]),
      rects: () => Promise.resolve({ 'go-b': { left: 10, top: 20, width: 28, height: 20 } }),
    });
    const { run, state } = setup({
      site,
      themeFit: () => Promise.resolve({ fits: true, why: 'Fits.', directions: [] }),
    });
    run.start();
    await skipLogin(state, run);
    await until(
      () => Boolean(state()?.findings.find((f) => f.title === 'Tap target is too small')?.box),
      10_000,
    );
    const f = state()?.findings.find((x) => x.title === 'Tap target is too small');
    expect(f?.box).toEqual({ left: 10, top: 20, width: 28, height: 20 });
    expect(f?.shotSize).toEqual({ width: 1024, height: 700 });
    expect(f?.assets?.shot).toBe('fitts-asset://demo-chat/run-1/assets/shot-_.jpg');
    run.dispose();
  });
});

describe('the portfolio run, replayed (Allen’s feedback, round 6)', () => {
  const looks = [testDirection('a', 'Desktop Playground'), testDirection('b', 'Candy Arcade')];
  /** The decider from the run: after the theme check it asks for a new look, then fixes. */
  const asInRun = () => {
    const asked: string[] = [];
    const outcomes: string[] = [];
    return {
      asked,
      outcomes,
      next(s: Situation): Promise<Decision> {
        outcomes.push(...s.recent.slice(-1).map((o) => `${o.ability}:${o.result}`));
        const d = this.pick(s);
        asked.push(d.ability);
        return Promise.resolve(d);
      },
      pick(s: Situation): Decision {
        const m = s.messages.find((x) => /another|more colou?r/i.test(x));
        if (m) return { ability: 'revise_looks', wish: m };
        if (s.ran.check_theme && !this.asked.includes('new_look'))
          return { ability: 'new_look', wish: 'like the Fitts app' };
        if (s.ran.check_theme && !this.asked.includes('fix')) return { ability: 'fix' };
        return { ability: scriptedNext(s) };
      },
    };
  };

  it('new_look can’t wipe looks that are showing, and fixes wait for the pick', async () => {
    const r = redesignable();
    r.site.probes = () =>
      Promise.resolve([
        {
          probe: 'target-size' as const,
          pass: false,
          items: [{ ref: 'go-b', selector: '', measured: '28×20px', expected: 'at least 24×24px' }],
        },
      ]);
    const decider = asInRun();
    const { run, state } = setup({
      site: r.site,
      fixer: r.fixer,
      redesigner: r.redesigner,
      decider,
      mode: 'ask-every',
      themeFit: () => Promise.resolve({ fits: false, why: 'New look.', directions: looks }),
    });
    run.start();
    // Ask every action asks before each tap: allow them all.
    const allowAll = setInterval(() => {
      const q = state()?.chat.find(
        (c) => c.type === 'question' && c.answer === undefined && c.text.startsWith('Can I'),
      );
      if (q) run.answer(q.id, copy.fitts.goAhead);
    }, 5);
    await skipLogin(state, run);
    const pick = () =>
      state()?.chat.find((c) => c.type === 'question' && c.text === copy.fitts.whichLook);
    await until(() => Boolean(pick()), 10_000);
    clearInterval(allowAll);
    // It asked for a new look over the showing ones: refused, so the looks are still there to
    // pick from, and no fix card came before the pick.
    expect(decider.asked).toContain('new_look');
    const shown = state()?.chat.filter((c) => c.type === 'directions') ?? [];
    expect(shown).toHaveLength(1);
    expect(state()?.chat.some((c) => c.type === 'approval.batch')).toBe(false);
    run.dispose();
  }, 20_000);

  it('asking for another round while the fix card waits makes one, instead of a note', async () => {
    const r = redesignable();
    r.site.probes = () =>
      Promise.resolve([
        {
          probe: 'target-size' as const,
          pass: false,
          items: [{ ref: 'go-b', selector: '', measured: '28×20px', expected: 'at least 24×24px' }],
        },
      ]);
    const { run, state } = setup({
      site: r.site,
      fixer: r.fixer,
      redesigner: r.redesigner,
      decider: asInRun(),
      themeFit: () => Promise.resolve({ fits: false, why: 'New look.', directions: looks }),
      reviseLooks: () => Promise.resolve([testDirection('c', 'Brighter Playground')]),
    });
    run.start();
    await skipLogin(state, run);
    await until(
      () =>
        Boolean(
          state()?.chat.find((c) => c.type === 'question' && c.text === copy.fitts.whichLook),
        ),
      10_000,
    );
    run.answer(
      state()?.chat.find((c) => c.type === 'question' && c.text === copy.fitts.whichLook)?.id ?? '',
      copy.fitts.keepLook,
    );
    await until(() => state()?.waitingFor === 'approval', 10_000);
    run.sendMessage('Can I get another redesign like Desktop Playground with more colors?');
    await until(
      () => Boolean(state()?.chat.find((c) => c.type === 'directions' && c.round === 2)),
      10_000,
    );
    run.dispose();
  }, 30_000);

  it('with a conversation, a message sent while Fitts acts is answered, not left queued', async () => {
    const { run, state } = setup({ converse: () => Promise.resolve('Sure.') });
    run.start();
    await until(() => state()?.activity === 'acting');
    run.sendMessage('what do you think so far?');
    await until(() =>
      Boolean(state()?.chat.some((c) => c.type === 'fitts.message' && c.text === 'Sure.')),
    );
    expect(state()?.queued).toEqual([]);
    run.dispose();
  });
});
