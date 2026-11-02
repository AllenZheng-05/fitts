// @vitest-environment node
// SPEC-phase4 §6C: unreachable models make the caller wait (never fail back to its caller); the
// no-cost check resumes everything and the exact call is sent again; an unusable answer is
// asked for once more and only then may the caller fall back. Offline (no waiter), failures
// still throw, so tests and the test build keep their fallbacks.
import type { Journey } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import { SparkBrain } from '../../src/agent/crawler/brain';
import { Coverage } from '../../src/agent/crawler/coverage';
import {
  FallbackJourneyBrain,
  PlanJourneyBrain,
  SparkJourneyBrain,
} from '../../src/agent/crawler/journey';
import {
  BudgetExceeded,
  LlmCaller,
  LlmError,
  UnusableAnswer,
  isUnreachable,
  isUnusable,
  pingProvider,
  retryUnusable,
  type LlmClient,
  type LlmRequest,
  type LlmResponse,
} from '../../src/agent/llm/call';
import { Reachability } from '../../src/agent/llm/reachability';
import { CostLedger } from '../../src/agent/ledger/ledger';
import { SparkDecider } from '../../src/agent/orchestrator/decider';
import type { Situation } from '../../src/agent/orchestrator/abilities';
import type { AxSnapshot } from '../../src/agent/protocol';
import { ReviewerPanel } from '../../src/agent/review/reviewers';

const ctx = () => ({ runId: 'r', projectId: 'p', contributor: false, allowed: () => true });
const usage = { input: 1, cached: 0, output: 1, reasoning: 0 };
const text = (outputText: string): LlmResponse => ({ outputText, output: [], usage, model: 'm' });
const tool = (name: string, args: Record<string, unknown>): LlmResponse => ({
  outputText: '',
  output: [{ type: 'function_call', name, arguments: JSON.stringify(args) }],
  usage,
  model: 'm',
});
const until = async (cond: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

/** A model behind a connection the test can cut and restore. */
function rig(answers: (req: LlmRequest, n: number) => LlmResponse) {
  const state = {
    down: false,
    failure: new LlmError('fetch failed', undefined as number | undefined, true),
  };
  const sent: LlmRequest[] = [];
  let n = 0;
  const client: LlmClient = {
    respond(req) {
      sent.push(req);
      if (state.down) return Promise.reject(state.failure);
      return Promise.resolve(answers(req, n++));
    },
  };
  const events: string[] = [];
  const reach = new Reachability(() => Promise.resolve(!state.down), { intervalMs: 10 });
  reach.on({
    down: (projectId) => events.push(`down ${projectId}`),
    up: (ids) => events.push(`up ${ids.join(',')}`),
  });
  const caller = new LlmCaller(() => client, new CostLedger(), {
    retries: 1,
    baseDelayMs: 1,
    waitForModels: (p, c, _e, signal) => reach.wait(p, c.projectId, signal),
  });
  return { state, sent, client, reach, caller, events };
}

describe('the two kinds of failure', () => {
  it('unreachable: no answer, timeouts, server errors, rate limits and refused keys', () => {
    for (const status of [undefined, 401, 403, 408, 409, 429, 500, 502, 503])
      expect(isUnreachable(new LlmError('x', status, true)), String(status)).toBe(true);
    for (const status of [400, 404, 422])
      expect(isUnreachable(new LlmError('x', status, false)), String(status)).toBe(false);
    expect(isUnreachable(new Error('bad json'))).toBe(false);
  });

  it('unusable: anything else except aborts, the budget cap and unreachable models', () => {
    expect(isUnusable(new UnusableAnswer())).toBe(true);
    expect(isUnusable(new SyntaxError('Unexpected token'))).toBe(true);
    expect(isUnusable(new LlmError('bad request', 400, false))).toBe(true);
    expect(isUnusable(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(false);
    expect(isUnusable(new BudgetExceeded())).toBe(false);
    expect(isUnusable(new LlmError('down', undefined, true))).toBe(false);
  });
});

describe('LlmCaller waits for unreachable models (§6C)', () => {
  it('pauses the project, checks every 10 s (here 10 ms), and sends the exact same call again', async () => {
    const r = rig(() => text('{"ok":true}'));
    r.state.down = true;
    const req: LlmRequest = { task: 'review', model: 'm', input: 'the page', fixture: 'x' };
    let done = false;
    const call = r.caller.call(ctx(), req).then((res) => {
      done = true;
      return res;
    });
    await until(() => r.events.includes('down p'));
    expect(r.reach.down).toBe(true);
    expect(r.reach.downSince).toBeGreaterThan(0);
    await new Promise((res) => setTimeout(res, 50));
    expect(done).toBe(false);
    r.state.down = false;
    const res = await call;
    expect(res.outputText).toBe('{"ok":true}');
    expect(r.events).toEqual(['down p', 'up p']);
    // Every attempt was this request, unchanged; the last one answered.
    expect(r.sent.every((s) => s === req)).toBe(true);
    expect(r.reach.down).toBe(false);
  });

  it('a refused key (401) waits the same way, without its own retries', async () => {
    const r = rig(() => text('ok'));
    r.state.down = true;
    r.state.failure = new LlmError('unauthorized', 401, false);
    const call = r.caller.call(ctx(), { task: 'crawl', model: 'm', input: 'x' });
    await until(() => r.events.includes('down p'));
    expect(r.sent).toHaveLength(1);
    r.state.down = false;
    await expect(call).resolves.toMatchObject({ outputText: 'ok' });
  });

  it('"Retry now" checks at once; a stopped run aborts the wait', async () => {
    const r = rig(() => text('ok'));
    const reach = new Reachability(() => Promise.resolve(!r.state.down), { intervalMs: 60_000 });
    const caller = new LlmCaller(() => r.client, new CostLedger(), {
      retries: 0,
      waitForModels: (p, c, _e, signal) => reach.wait(p, c.projectId, signal),
    });
    r.state.down = true;
    const call = caller.call(ctx(), { task: 'crawl', model: 'm', input: 'x' });
    await until(() => reach.down);
    r.state.down = false;
    await reach.retryNow();
    await expect(call).resolves.toMatchObject({ outputText: 'ok' });

    r.state.down = true;
    const abort = new AbortController();
    const stopped = caller.call(ctx(), {
      task: 'crawl',
      model: 'm',
      input: 'x',
      signal: abort.signal,
    });
    await until(() => reach.down);
    abort.abort();
    await expect(stopped).rejects.toMatchObject({ name: 'AbortError' });
    reach.dispose();
  });

  it('without a waiter (offline and test builds) the failure is thrown, as before', async () => {
    const client: LlmClient = {
      respond: () => Promise.reject(new LlmError('down', undefined, true)),
    };
    const caller = new LlmCaller(() => client, new CostLedger(), { retries: 0 });
    await expect(
      caller.call(ctx(), { task: 'crawl', model: 'm', input: 'x' }),
    ).rejects.toBeInstanceOf(LlmError);
    const offline = new LlmCaller(() => client, new CostLedger(), {
      retries: 0,
      waitForModels: () => undefined,
    });
    await expect(
      offline.call(ctx(), { task: 'crawl', model: 'm', input: 'x' }),
    ).rejects.toBeInstanceOf(LlmError);
  });

  it('an unusable request (400) is never waited on: it is thrown for the caller to handle', async () => {
    const r = rig(() => text('ok'));
    r.state.down = true;
    r.state.failure = new LlmError('bad request', 400, false);
    await expect(
      r.caller.call(ctx(), { task: 'crawl', model: 'm', input: 'x' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(r.events).toEqual([]);
  });

  it('the no-cost check is GET /v1/models with the key; no key or no answer is "down"', async () => {
    const urls: string[] = [];
    const ok = ((url: string) => {
      urls.push(url);
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as unknown as typeof fetch;
    expect(await pingProvider('meta', 'k', ok)).toBe(true);
    expect(urls[0]).toMatch(/\/v1\/models$/);
    expect(await pingProvider('meta', undefined, ok)).toBe(false);
    const fail = (() => Promise.reject(new Error('ENOTFOUND'))) as unknown as typeof fetch;
    expect(await pingProvider('meta', 'k', fail)).toBe(false);
  });
});

describe('an unusable answer is asked for once more, then the fallback (§6C)', () => {
  it('retryUnusable: one retry, then the second failure; never for unreachable or aborts', async () => {
    let n = 0;
    await expect(
      retryUnusable(() =>
        n++ === 0 ? Promise.reject(new UnusableAnswer()) : Promise.resolve('ok'),
      ),
    ).resolves.toBe('ok');
    n = 0;
    await expect(
      retryUnusable(() => (n++, Promise.reject(new UnusableAnswer('twice')))),
    ).rejects.toThrow('twice');
    expect(n).toBe(2);
    n = 0;
    await expect(
      retryUnusable(() => (n++, Promise.reject(new BudgetExceeded()))),
    ).rejects.toBeInstanceOf(BudgetExceeded);
    expect(n).toBe(1);
  });

  const situation = { ran: {}, coverage: { ended: false } } as unknown as Situation;

  it('the decider: a bad answer then a good one decides; two bad ones throw (the loop falls back)', async () => {
    const good = rig((_req, n) =>
      n === 0 ? text('no tool') : tool('explore', { route: '', say: '', why: 'more pages' }),
    );
    await expect(
      new SparkDecider(good.caller, ctx, () => 'm').next(situation),
    ).resolves.toMatchObject({ ability: 'explore' });
    expect(good.sent).toHaveLength(2);
    const bad = rig(() => tool('make_coffee', {}));
    await expect(
      new SparkDecider(bad.caller, ctx, () => 'm').next(situation),
    ).rejects.toBeInstanceOf(UnusableAnswer);
    expect(bad.sent).toHaveLength(2);
  });

  const snap: AxSnapshot = {
    url: 'http://x/',
    path: '/',
    title: 'App',
    headings: [],
    nodes: [{ ref: 'go', role: 'button', name: 'Go' }],
    hasPassword: false,
  };

  it('the crawl brain: one retry, then the explorer picks', async () => {
    const r = rig(() => tool('click', { ref: 'nope', why: 'x' }));
    const coverage = new Coverage('http://x');
    coverage.observe(snap);
    const action = await new SparkBrain(r.caller, ctx, () => 'm').next({
      snapshot: snap,
      coverage,
      brief: {},
      history: [],
    });
    expect(r.sent).toHaveLength(2);
    expect(action).toMatchObject({ kind: 'click', ref: 'go' });
  });

  it('a journey step: one retry, then the plan takes the step', async () => {
    const journey: Journey = {
      id: 'j',
      name: 'Go',
      goal: 'Gone',
      start: '/',
      steps: ['Tap Go'],
      pages: ['/'],
      priority: 1,
      source: 'code',
    };
    const r = rig(() => tool('click', { ref: 'nope', why: 'x' }));
    const brain = new FallbackJourneyBrain(
      new SparkJourneyBrain(r.caller, ctx, () => 'm'),
      new PlanJourneyBrain(),
    );
    await expect(brain.next({ journey, snapshot: snap, history: [] })).resolves.toMatchObject({
      kind: 'click',
      ref: 'go',
    });
    expect(r.sent).toHaveLength(2);
  });

  it('a reviewer whose answer is unreadable twice says so (never silently empty); once is retried', async () => {
    const ev = { route: '/', snapshot: snap, trace: [], probes: [] };
    const roster = () => [{ provider: 'meta' as const, model: 'm' }];
    const bad = rig(() => text('not json at all'));
    const reviews = await new ReviewerPanel(bad.caller, ctx, roster).review(ev, {});
    expect(reviews.every((x) => x.unusable === true && x.drafts.length === 0)).toBe(true);
    expect(bad.sent).toHaveLength(10);
    const once = rig((req, n) => (n < 5 ? text('garbage') : text('{"findings":[]}')));
    const ok = await new ReviewerPanel(once.caller, ctx, roster).review(ev, {});
    expect(ok.some((x) => x.unusable)).toBe(false);
  });
});
