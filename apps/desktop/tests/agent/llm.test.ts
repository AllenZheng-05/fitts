// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BudgetGuard } from '../../src/agent/ledger/budget';
import { CostLedger, withLedger, zeroTotals } from '../../src/agent/ledger/ledger';
import type { LlmError } from '../../src/agent/llm/call';
import { BudgetExceeded, LlmCaller, type CallContext } from '../../src/agent/llm/call';
import { FakeLlmClient, type Fixture } from '../../src/agent/llm/fake';
import { tokenUsd } from '../../src/agent/llm/pricing';
import {
  contributorFor,
  modelFor,
  reviewerRoster,
  SPARK,
  SPARK_CONTRIBUTOR,
  SPARK_OPEN,
  WONDER,
} from '../../src/agent/llm/router';

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/llm', `${name}.json`), 'utf8')) as Fixture;
const SPARK_FIX = fixture('p3-spark-finding');
const WONDER_FIX = fixture('p3-wonder-finding');

const ctx = (over: Partial<CallContext> = {}): CallContext => ({
  runId: 'run-1',
  projectId: 'demo-chat',
  contributor: false,
  allowed: () => true,
  ...over,
});

describe('pricing', () => {
  it('prices fresh input, cached input and output per million tokens', () => {
    // 1M fresh in at $1.25, 1M cached at $0.15, 1M out at $4.25.
    expect(tokenUsd(SPARK, { input: 2_000_000, cached: 1_000_000, output: 1_000_000 })).toBeCloseTo(
      5.65,
    );
    expect(
      tokenUsd(SPARK_CONTRIBUTOR, { input: 1_000_000, cached: 0, output: 1_000_000 }),
    ).toBeCloseTo(0.3);
    expect(tokenUsd('unknown-model', { input: 10, cached: 0, output: 10 })).toBe(0);
  });
});

describe('LlmCaller + ledger (recorded fixtures, no network)', () => {
  it('records one ledger entry per call with the right phase and price', async () => {
    const ledger = new CostLedger();
    const caller = new LlmCaller(() => new FakeLlmClient([SPARK_FIX, WONDER_FIX]), ledger);
    const a = await caller.call(ctx(), {
      task: 'review',
      model: SPARK,
      input: 'x',
      fixture: SPARK_FIX.name,
    });
    await caller.call(ctx(), {
      task: 'aggregate',
      model: WONDER,
      input: 'x',
      fixture: WONDER_FIX.name,
      findingId: 'f1',
    });
    expect(JSON.parse(a.outputText)).toMatchObject({
      heuristic: expect.stringMatching(/^H\d+$/) as unknown,
    });
    const [review, aggregate] = ledger.forRun('run-1');
    expect(review).toMatchObject({
      task: 'review',
      phase: 'reviewers',
      provider: 'meta',
      model: SPARK,
    });
    expect(review?.usd).toBeCloseTo(tokenUsd(SPARK, SPARK_FIX.response.usage), 9);
    expect(aggregate).toMatchObject({ phase: 'summing', findingId: 'f1' });
    const totals = ledger.totals('run-1');
    expect(totals.spentUsd).toBeCloseTo((review?.usd ?? 0) + (aggregate?.usd ?? 0), 6);
    expect(totals.byPhase.reviewers).toBeCloseTo(review?.usd ?? 0, 6);
    expect(ledger.findingCost('f1')).toBeCloseTo(aggregate?.usd ?? 0, 6);
  });

  it('routes meta-models/* to Baseten', async () => {
    const seen: string[] = [];
    const caller = new LlmCaller((p) => {
      seen.push(p);
      return new FakeLlmClient([SPARK_FIX]);
    }, new CostLedger());
    await caller.call(ctx(), { task: 'review', model: SPARK_OPEN, input: 'x' });
    expect(seen).toEqual(['baseten']);
  });

  it('retries 429 and 5xx with backoff, then succeeds', async () => {
    const client = new FakeLlmClient([SPARK_FIX], [429, 503]);
    const caller = new LlmCaller(() => client, new CostLedger(), { baseDelayMs: 1 });
    await caller.call(ctx(), { task: 'review', model: SPARK, input: 'x' });
    expect(client.requests).toHaveLength(3);
  });

  it('does not retry a 400, and reports trouble after 3 failed retries', async () => {
    const troubles: LlmError[] = [];
    const bad = new LlmCaller(() => new FakeLlmClient([SPARK_FIX], [400]), new CostLedger(), {
      baseDelayMs: 1,
      onTrouble: (e) => troubles.push(e),
    });
    await expect(bad.call(ctx(), { task: 'review', model: SPARK, input: 'x' })).rejects.toThrow(
      'HTTP 400',
    );
    expect(troubles).toHaveLength(0);
    const down = new LlmCaller(
      () => new FakeLlmClient([SPARK_FIX], [500, 500, 500, 500]),
      new CostLedger(),
      {
        baseDelayMs: 1,
        onTrouble: (e) => troubles.push(e),
      },
    );
    await expect(down.call(ctx(), { task: 'review', model: SPARK, input: 'x' })).rejects.toThrow(
      'HTTP 500',
    );
    expect(troubles).toHaveLength(1);
  });

  it('refuses new calls while the run is at its cap, without calling the provider', async () => {
    const client = new FakeLlmClient([SPARK_FIX]);
    const caller = new LlmCaller(() => client, new CostLedger());
    await expect(
      caller.call(ctx({ allowed: () => false }), { task: 'review', model: SPARK, input: 'x' }),
    ).rejects.toBeInstanceOf(BudgetExceeded);
    expect(client.requests).toHaveLength(0);
  });

  it('stops retrying when the call is aborted (⌘.)', async () => {
    const controller = new AbortController();
    const caller = new LlmCaller(
      () => new FakeLlmClient([SPARK_FIX], [503, 503]),
      new CostLedger(),
      {
        baseDelayMs: 50,
      },
    );
    const pending = caller.call(ctx(), {
      task: 'review',
      model: SPARK,
      input: 'x',
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow(/abort/i);
  });
});

describe('budget guard with a $0.10 test cap', () => {
  it('warns once at 80%, stops at 100%, and re-arms when the cap is raised', () => {
    const g = new BudgetGuard();
    expect(g.check('r', 0.05, 0.1)).toBeNull();
    expect(g.check('r', 0.08, 0.1)).toBe('warn');
    expect(g.check('r', 0.09, 0.1)).toBeNull();
    expect(g.check('r', 0.1, 0.1)).toBe('stop');
    expect(g.check('r', 0.12, 0.1)).toBeNull();
    expect(g.allowed(0.12, 0.1)).toBe(false);
    // "Add $10": the run continues until the new cap.
    expect(g.allowed(0.12, 10.1)).toBe(true);
    expect(g.check('r', 5, 10.1)).toBeNull();
    expect(g.check('r', 10.2, 10.1)).toBe('stop');
  });

  it('shows ledger spend on top of the run cost', () => {
    const t = zeroTotals();
    t.spentUsd = 0.02;
    t.byPhase.reviewers = 0.02;
    const cost = withLedger(
      {
        spentUsd: 1,
        capUsd: 20,
        byPhase: { fixes: 0.5, reviewers: 0.5, crawling: 0, summing: 0, media: 0 },
      },
      t,
    );
    expect(cost).toEqual({
      spentUsd: 1.02,
      capUsd: 20,
      byPhase: { fixes: 0.5, reviewers: 0.52, crawling: 0, summing: 0, media: 0 },
    });
  });
});

describe('router', () => {
  const o = { contributor: false, baseten: true };
  it('follows the §2 table by profile', () => {
    expect(modelFor('crawl', 'quality', o)).toEqual({ provider: 'meta', model: SPARK });
    expect(modelFor('aggregate', 'quality', o).model).toBe(WONDER);
    expect(modelFor('aggregate', 'economy', o).model).toBe(SPARK);
    expect(modelFor('aggregate', 'open', o).model).toBe(SPARK_OPEN);
    expect(modelFor('fix', 'quality', o).model).toBe(WONDER);
  });
  it('puts one Spark reviewer on Spark Open in Quality when Baseten is set up', () => {
    expect(reviewerRoster('quality', o).map((m) => m.model)).toEqual([
      SPARK_OPEN,
      SPARK,
      SPARK,
      WONDER,
      WONDER,
    ]);
    expect(reviewerRoster('quality', { ...o, baseten: false }).map((m) => m.model)).toEqual([
      SPARK,
      SPARK,
      SPARK,
      WONDER,
      WONDER,
    ]);
    expect(new Set(reviewerRoster('open', o).map((m) => m.provider))).toEqual(new Set(['baseten']));
  });
  it('uses contributor pricing for demo projects only, unless opted in', () => {
    expect(contributorFor('demo-chat', true)).toBe(true);
    expect(contributorFor('acme-shop', true)).toBe(false);
    expect(contributorFor('acme-shop', true, true)).toBe(true);
    expect(contributorFor('demo-chat', false)).toBe(false);
    expect(modelFor('chat', 'quality', { contributor: true, baseten: false }).model).toBe(
      SPARK_CONTRIBUTOR,
    );
  });
});
