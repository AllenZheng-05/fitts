// @vitest-environment node
import {
  reduce,
  type Finding,
  type ProbeResult,
  type RunEvent,
  type RunState,
} from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import { diffOf, FixPipeline, judge, prBody, type Fixer } from '../../src/agent/fix/pipeline';
import { taskFile } from '../../src/agent/fix/fixer';
import type { CiRun, FixCall, VerifyResult } from '../../src/agent/protocol';
import type { Check } from '../../src/agent/review/aggregate';
import type { Site } from '../../src/agent/site-client';

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'run-1-f1',
  runId: 'run-1',
  severity: 2,
  heuristic: 'H7',
  lens: 'ergonomics',
  title: 'Tap target is too small',
  finding: 'This control is 28×20px.',
  fix: 'Make it 44px.',
  route: '/compose/confirm',
  agreement: { agreeing: 1, total: 5, who: ['Probe'] },
  evidence: ['28×20px (expected at least 24×24px)'],
  elementRef: 'compose-send',
  stepIndex: 3,
  atMs: 9000,
  status: 'open',
  lane: 'shown',
  source: { file: 'src/pages/Compose.tsx', line: 131, confidence: 'plugin' },
  ...over,
});

const check: Check = {
  probe: 'target-size',
  title: 'Tap target is too small',
  routes: ['/compose/confirm'],
  hrefs: [],
};

const item = (ref: string, measured: string) => ({ ref, selector: '', measured, expected: '' });
const failing = (probe: ProbeResult['probe'], items: ReturnType<typeof item>[]): ProbeResult => ({
  evidenceId: 'e',
  probe,
  route: '/compose/confirm',
  pass: items.length === 0,
  items,
});
const verify = (results: ProbeResult[], over: Partial<VerifyResult> = {}): VerifyResult => ({
  ok: true,
  results,
  focus: [],
  viewport: [],
  links: {},
  ...over,
});

describe('verification (§9.2)', () => {
  const baseline = [failing('target-size', [item('compose-send', '28×20px')])];

  it('passes when the problem is gone and nothing new appears', () => {
    expect(judge(check, verify([failing('target-size', [])]), baseline)).toBeNull();
  });

  it('fails when the probe still reports it, or a new severity ≥2 problem appears', () => {
    expect(judge(check, verify(baseline), baseline)).toMatch(
      /still reports “Tap target is too small”/,
    );
    expect(
      judge(check, verify([failing('contrast', [item('x', 'text contrast 2.1:1')])]), baseline),
    ).toBe('it caused a new problem: Text is too faint to read');
    // New but cosmetic (severity 1): fine.
    expect(
      judge(check, verify([], { viewport: [item('b', 'text cut off at 360px')] }), baseline),
    ).toBeNull();
    expect(
      judge(check, verify([], { ok: false, error: 'the dev server didn’t start' }), baseline),
    ).toBe('the dev server didn’t start');
  });

  it('a broken link passes once it loads', () => {
    const links: Check = {
      probe: 'links',
      title: 'Link goes to a missing page',
      routes: ['/'],
      hrefs: ['/help'],
    };
    expect(judge(links, verify([], { links: { '/help': 404 } }), [])).toBe(
      '/help still doesn’t load',
    );
    expect(judge(links, verify([], { links: { '/help': 200 } }), [])).toBeNull();
  });
});

describe('task file, PR body, diff', () => {
  it('the task names the problem, the source hint, the constraints and the check', () => {
    const t = taskFile(finding(), check, 'it caused a new problem: Text is too faint to read');
    expect(t).toContain('Source hint (from the Fitts plugin): src/pages/Compose.tsx:131');
    expect(t).toContain('minimal diff');
    expect(t).toContain(
      'the "target-size" probe on /compose/confirm no longer reports "Tap target is too small"',
    );
    expect(t).toContain('A previous attempt was rolled back: it caused a new problem');
  });

  it('the PR body has heuristic, severity, evidence and verification, and no AI attribution', () => {
    const body = prBody(finding(), check, 'Gave the Send link 44px of padding.');
    expect(body).toContain('**H7** · severity 2');
    expect(body).toContain('Gave the Send link 44px of padding.');
    expect(body).toContain('Re-ran the target-size probe');
    expect(body).not.toMatch(/generated|co-authored|claude|anthropic/i);
  });

  it('turns a unified diff into the Finding panel’s lines', () => {
    const d = diffOf(
      'diff --git a/x b/x\n--- a/src/a.css\n+++ b/src/a.css\n@@ -1 +1 @@\n-.send{padding:0}\n+.send{padding:12px}\n',
    );
    expect(d).toEqual({
      files: ['src/a.css'],
      lines: [
        { kind: 'del', text: '.send{padding:0}' },
        { kind: 'add', text: '.send{padding:12px}' },
      ],
    });
  });
});

/** A fake main: jobs, verification results by attempt, and a dry-run PR registry. */
function harness(mode: RunState['mode'], verdicts: VerifyResult[], ciRuns: CiRun[] = []) {
  let state = {
    runId: 'run-1',
    mode,
    findings: [finding()],
    changes: [],
    chat: [],
    fixingCount: 0,
  } as unknown as RunState;
  const calls: FixCall[] = [];
  const prs: { number: number; state: 'open' | 'closed' | 'merged' }[] = [];
  let job = 0;
  const site = {
    fix: (call: FixCall) => {
      calls.push(call);
      switch (call.fn) {
        case 'prepare':
          job += 1;
          return Promise.resolve({ job: `run-1/f1-${job}`, branch: `fitts/h7-tap-target-${job}` });
        case 'patch':
          return Promise.resolve({ ok: true });
        case 'verify':
          return Promise.resolve(verdicts.shift() ?? verify([]));
        case 'ci':
          return Promise.resolve(ciRuns.shift());
        case 'diff':
          return Promise.resolve('+++ b/src/styles.css\n-a\n+b\n');
        case 'commit':
          return Promise.resolve({ ok: true, sha: 'abc' });
        case 'prOpen':
        case 'revert': {
          const number = prs.length + 1;
          prs.push({ number, state: 'open' });
          return Promise.resolve({ number, url: `dry-run://pr/${number}` });
        }
        case 'prMerged':
          return Promise.resolve(prs.find((p) => p.number === call.pr)?.state === 'merged');
        case 'prClose': {
          const pr = prs.find((p) => p.number === call.pr);
          if (pr) pr.state = 'closed';
          return Promise.resolve();
        }
        default:
          return Promise.resolve(undefined);
      }
    },
  } as unknown as Site;
  const fixer: Fixer = async (_task, tools) => {
    await tools.patch('src/styles.css', '.send-link{}', '.send-link{padding:12px}');
    return { patched: 1, summary: 'Gave the Send link padding.' };
  };
  const said: string[] = [];
  let idle = 0;
  const pipeline = new FixPipeline(
    {
      state: () => state,
      emit: (events: RunEvent[]) => {
        for (const e of events) state = reduce(state, e) ?? state;
      },
      say: (t) => said.push(t),
      id: () => `item-${said.length}-${Math.random()}`,
      ask: () => Promise.resolve(true),
      baseline: () => [failing('target-size', [item('compose-send', '28×20px')])],
      costOf: () => 0.01,
      idle: () => (idle += 1),
      restingActivity: () => 'acting',
    },
    site,
    fixer,
    new Map([['run-1-f1', check]]),
  );
  const settled = async () => {
    for (let i = 0; i < 100 && pipeline.busy; i++) await new Promise((r) => setTimeout(r, 2));
  };
  return { pipeline, state: () => state, calls, prs, said, settled, idle: () => idle };
}

describe('the fix pipeline (§9)', () => {
  it('Autonomous: a verified fix is committed and its PR opens without asking', async () => {
    const h = harness('autonomous', [verify([failing('target-size', [])])]);
    h.pipeline.start(['run-1-f1']);
    await h.settled();
    const s = h.state();
    expect(s.changes).toEqual([
      expect.objectContaining({
        status: 'verified',
        prNumber: 1,
        branch: 'fitts/h7-tap-target-1',
        costUsd: 0.01,
      }),
    ]);
    expect(s.findings[0]).toMatchObject({
      status: 'pr-opened',
      prNumber: 1,
      prUrl: 'dry-run://pr/1',
    });
    expect(s.findings[0]?.diff?.files).toEqual(['src/styles.css']);
    // The project's tests run first on the untouched worktree (here it has none to run).
    expect(h.calls.map((c) => c.fn)).toEqual([
      'prepare',
      'tests',
      'ci',
      'patch',
      'verify',
      'diff',
      'commit',
      'prOpen',
    ]);
    expect(s.chat.some((c) => c.type === 'fix.result')).toBe(true);
    expect(h.idle()).toBe(1);
  });

  it('a fix that breaks a CI check that passed before is rolled back; the PR names the checks', async () => {
    const lint = (ok: boolean) => ({
      name: 'pnpm lint',
      ok,
      summary: ok ? '' : 'src/a.css: error',
    });
    const broken = harness(
      'autonomous',
      [verify([failing('target-size', [])])],
      [
        { ran: true, checks: [lint(true)] },
        { ran: true, checks: [lint(false)] },
      ],
    );
    broken.pipeline.start(['run-1-f1']);
    await broken.settled();
    expect(broken.state().changes[0]).toMatchObject({
      status: 'rolled-back',
      reason: 'your CI check “pnpm lint” fails with this change: src/a.css: error',
    });

    // A check that already failed before the change doesn't count against it.
    const ok = harness(
      'autonomous',
      [verify([failing('target-size', [])])],
      [
        { ran: true, checks: [lint(true), { name: 'pnpm typecheck', ok: false, summary: '' }] },
        { ran: true, checks: [lint(true), { name: 'pnpm typecheck', ok: false, summary: '' }] },
      ],
    );
    ok.pipeline.start(['run-1-f1']);
    await ok.settled();
    expect(ok.state().changes[0]?.status).toBe('verified');
    const pr = ok.calls.find((c) => c.fn === 'prOpen');
    expect(pr && 'body' in pr ? pr.body : '').toContain('Your CI checks pass on this branch');
  });

  it('a failing fix is rolled back with its reason, then retried and verified with a new PR', async () => {
    const h = harness('autonomous', [
      verify([failing('target-size', [item('compose-send', '28×20px')])]),
    ]);
    h.pipeline.start(['run-1-f1']);
    await h.settled();
    let change = h.state().changes[0];
    expect(change).toMatchObject({
      status: 'rolled-back',
      reason: 'the target-size probe still reports “Tap target is too small”',
    });
    expect(h.state().findings[0]?.status).toBe('rolled-back');
    expect(h.calls.some((c) => c.fn === 'discard')).toBe(true);
    expect(h.calls.some((c) => c.fn === 'commit')).toBe(false);

    h.pipeline.retry(change?.id ?? '');
    expect(h.state().changes[0]?.status).toBe('retrying');
    await h.settled();
    change = h.state().changes[0];
    expect(h.state().changes).toHaveLength(1);
    expect(change).toMatchObject({ status: 'verified', prNumber: 1 });
    expect(h.state().findings[0]?.status).toBe('pr-opened');
  });

  it('undo closes an open PR; undo of a merged PR opens a revert PR', async () => {
    const open = harness('autonomous', [verify([])]);
    open.pipeline.start(['run-1-f1']);
    await open.settled();
    await open.pipeline.undo(open.state().changes[0]?.id ?? '');
    expect(open.prs[0]?.state).toBe('closed');
    expect(open.state().changes[0]?.status).toBe('undone');
    expect(open.state().findings[0]?.status).toBe('undone');
    expect(open.said).toContain('Undone · PR #1 closed.');

    const merged = harness('autonomous', [verify([])]);
    merged.pipeline.start(['run-1-f1']);
    await merged.settled();
    const pr = merged.prs[0];
    if (pr) pr.state = 'merged';
    await merged.pipeline.undo(merged.state().changes[0]?.id ?? '');
    expect(merged.calls.at(-1)).toMatchObject({
      fn: 'revert',
      pr: 1,
      branch: 'fitts/h7-tap-target-1',
    });
    expect(merged.said).toContain('Revert PR #2 opened.');
  });

  it('a fix started in Autonomous asks before its PR when the mode has changed', async () => {
    const h = harness('autonomous', [verify([])]);
    let asked = '';
    // Switch to Ask when unsure mid-fix, and answer Skip.
    h.pipeline.start(['run-1-f1']);
    const s = h.state() as { mode: RunState['mode'] };
    s.mode = 'ask-unsure';
    (h.pipeline as unknown as { host: { ask: (t: string) => Promise<boolean> } }).host.ask = (
      t,
    ) => {
      asked = t;
      return Promise.resolve(false);
    };
    await h.settled();
    expect(asked).toBe(
      'Can I push fitts/h7-tap-target-1 to GitHub and open a pull request for “Tap target is too small”?',
    );
    expect(h.state().changes[0]).toMatchObject({ status: 'verified' });
    expect(h.state().changes[0]?.prNumber).toBeUndefined();
  });

  it('only findings with a check verification can re-run are fixable', () => {
    const h = harness('autonomous', []);
    expect(h.pipeline.fixable(['run-1-f1', 'run-1-f9'])).toEqual(['run-1-f1']);
    const network = new FixPipeline(
      {} as never,
      {} as Site,
      () => Promise.resolve({ patched: 0, summary: '' }),
      new Map([
        [
          'n',
          { probe: 'network', title: 'Response is far too large', routes: ['/search'], hrefs: [] },
        ],
      ]),
    );
    expect(network.fixable(['n'])).toEqual([]);
  });
});

describe('what can be fixed automatically', () => {
  it('a problem seen only on a phone is not: verification runs at desktop size', () => {
    const pipeline = new FixPipeline(
      {} as never,
      {} as Site,
      (() => undefined) as never,
      new Map([
        ['desk', check],
        ['phone', { ...check, device: 'phone' }],
      ]),
    );
    expect(pipeline.fixable(['desk', 'phone'])).toEqual(['desk']);
  });
});
