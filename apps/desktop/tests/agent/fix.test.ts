// @vitest-environment node
import {
  reduce,
  type Finding,
  type ProbeResult,
  type RunEvent,
  type RunState,
} from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import {
  diffOf,
  FixPipeline,
  fixSection,
  judge,
  runPrBody,
  runPrTitle,
  type Fixer,
} from '../../src/agent/fix/pipeline';
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
  it('the task names the problem, the source hint, the constraints, the check and the CI checks', () => {
    const t = taskFile(finding(), check, {
      retryReason: 'it caused a new problem: Text is too faint to read',
      checks: [
        { name: 'pnpm lint', passing: true },
        { name: 'pnpm typecheck', passing: false },
      ],
      tests: true,
    });
    expect(t).toContain('Source hint (from the Fitts plugin): src/pages/Compose.tsx:131');
    expect(t).toContain('minimal diff');
    expect(t).toContain(
      'the "target-size" probe on /compose/confirm no longer reports "Tap target is too small"',
    );
    expect(t).toContain(
      'run each with run_check before done; they must pass): `pnpm lint`, `pnpm typecheck` (already failing; not yours to fix).',
    );
    expect(t).toContain('run_check("tests")');
    expect(t).toContain('A previous attempt was rolled back: it caused a new problem');
    // A repair pass: the change is still there, and here's what it failed.
    const repair = taskFile(finding(), check, {
      failure: 'your CI check “pnpm lint” fails with this change:\nsrc/a.css: error',
    });
    expect(repair).toContain(
      'Your change is already in this worktree, but it failed:\nyour CI check “pnpm lint” fails with this change:\nsrc/a.css: error',
    );
    expect(repair).toContain('keep the change');
  });

  it('the run’s PR body has each change with heuristic, severity and evidence, and no AI attribution', () => {
    const section = fixSection(finding(), check, 'Gave the Send link 44px of padding.');
    expect(section).toContain('## Tap target is too small');
    expect(section).toContain('**H7** · severity 2');
    expect(section).toContain('Gave the Send link 44px of padding.');
    expect(section).toContain('Re-ran the target-size probe');
    const body = runPrBody([section], { tested: true, ci: ['pnpm lint'], redesigned: false });
    expect(body).toContain('## Verification');
    expect(body).toContain('Your test suite passes on this branch.');
    expect(body).toContain('Your CI checks pass on this branch: `pnpm lint`.');
    expect(body).not.toMatch(/generated|co-authored|claude|anthropic/i);
    const fix = (id: string) => ({
      id,
      findingIds: [],
      kind: 'fix' as const,
      title: 'x',
      costUsd: 0,
      status: 'verified' as const,
    });
    expect(runPrTitle([fix('a'), fix('b')])).toBe('Fitts: 2 fixes');
    expect(runPrTitle([{ ...fix('r'), kind: 'redesign', title: 'Redesign: Quiet stone' }])).toBe(
      'Redesign: Quiet stone',
    );
    expect(
      runPrTitle([{ ...fix('r'), kind: 'redesign', title: 'Redesign: Quiet stone' }, fix('a')]),
    ).toBe('Redesign: Quiet stone and 1 fix');
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

/** A fake main: the run's worktree, verification results by attempt, and a dry-run PR registry. */
function harness(
  mode: RunState['mode'],
  verdicts: VerifyResult[],
  ciRuns: CiRun[] = [],
  opts: { checkFirst?: boolean } = {},
) {
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
  let commits = 0;
  const site = {
    fix: (call: FixCall) => {
      calls.push(call);
      switch (call.fn) {
        case 'prepare':
          return Promise.resolve({ job: 'run-1/run', branch: 'fitts/run-run-1', sha: 'base' });
        case 'patch':
          return Promise.resolve({ ok: true });
        case 'verify':
          return Promise.resolve(verdicts.shift() ?? verify([]));
        case 'ci': {
          const run = ciRuns.shift();
          if (!run || call.only === undefined) return Promise.resolve(run);
          return Promise.resolve({
            ran: true,
            checks: run.checks.filter((c) => c.name === call.only),
          });
        }
        case 'diff':
          return Promise.resolve('+++ b/src/styles.css\n-a\n+b\n');
        case 'commit':
          commits += 1;
          return Promise.resolve({ ok: true, sha: `c${commits}` });
        case 'revertCommit':
          commits += 1;
          return Promise.resolve({ ok: true, sha: `c${commits}` });
        case 'prOpen':
        case 'revert': {
          const number = prs.length + 1;
          prs.push({ number, state: 'open' });
          return Promise.resolve({ number, url: `dry-run://pr/${number}` });
        }
        case 'prMerged':
          return Promise.resolve(prs.find((p) => p.number === call.pr)?.state === 'merged');
        default:
          return Promise.resolve(undefined);
      }
    },
  } as unknown as Site;
  const tasks: string[] = [];
  const checked: string[] = [];
  const fixer: Fixer = async (task, tools) => {
    tasks.push(task);
    await tools.patch('src/styles.css', '.send-link{}', '.send-link{padding:12px}');
    if (opts.checkFirst) checked.push((await tools.check('pnpm lint')).output);
    return { patched: 1, summary: 'Gave the Send link padding.' };
  };
  const said: string[] = [];
  let idle = 0;
  const settled: string[] = [];
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
      settled: (c) => settled.push(`${c.status}:${c.title}`),
    },
    site,
    fixer,
    new Map([['run-1-f1', check]]),
  );
  const wait = async () => {
    for (let i = 0; i < 100 && pipeline.busy; i++) await new Promise((r) => setTimeout(r, 2));
  };
  return {
    pipeline,
    state: () => state,
    calls,
    prs,
    said,
    tasks,
    checked,
    settled,
    wait,
    idle: () => idle,
  };
}

const lint = (ok: boolean) => ({ name: 'pnpm lint', ok, summary: ok ? '' : 'src/a.css: error' });

describe('the fix pipeline (§9)', () => {
  it('Autonomous: a verified fix is committed on the run’s branch; the PR opens at the end', async () => {
    const h = harness('autonomous', [verify([failing('target-size', [])])]);
    h.pipeline.start(['run-1-f1']);
    await h.wait();
    let s = h.state();
    expect(s.changes).toEqual([
      expect.objectContaining({
        status: 'verified',
        branch: 'fitts/run-run-1',
        sha: 'c1',
        attempts: 1,
        costUsd: 0.01,
      }),
    ]);
    expect(s.changes[0]?.prNumber).toBeUndefined();
    expect(s.findings[0]).toMatchObject({ status: 'verified' });
    expect(s.findings[0]?.diff?.files).toEqual(['src/styles.css']);
    // The project's tests and checks run first on the untouched worktree (none to run here).
    expect(h.calls.map((c) => c.fn)).toEqual([
      'prepare',
      'tests',
      'ci',
      'patch',
      'verify',
      'diff',
      'commit',
    ]);
    expect(s.chat.some((c) => c.type === 'fix.result')).toBe(true);
    expect(h.idle()).toBe(1);
    expect(h.settled).toEqual(['verified:Tap target is too small']);

    expect(await h.pipeline.finalize()).toEqual({ number: 1, url: 'dry-run://pr/1' });
    s = h.state();
    expect(s.changes[0]).toMatchObject({ prNumber: 1, prUrl: 'dry-run://pr/1' });
    expect(s.findings[0]).toMatchObject({ status: 'pr-opened', prNumber: 1 });
    const pr = h.calls.find((c) => c.fn === 'prOpen');
    expect(pr && 'title' in pr ? pr.title : '').toBe('Fitts: 1 fix');
    // Once is enough.
    expect(await h.pipeline.finalize()).toEqual({ number: 1, url: 'dry-run://pr/1' });
    expect(h.calls.filter((c) => c.fn === 'prOpen')).toHaveLength(1);
  });

  it('a fix that breaks a CI check gets a repair pass with the output, then passes', async () => {
    const h = harness(
      'autonomous',
      [verify([failing('target-size', [])])],
      [
        { ran: true, checks: [lint(true)] },
        { ran: true, checks: [lint(false)] },
        { ran: true, checks: [lint(true)] },
      ],
    );
    h.pipeline.start(['run-1-f1']);
    await h.wait();
    expect(h.state().changes[0]).toMatchObject({ status: 'verified', attempts: 2 });
    expect(h.tasks).toHaveLength(2);
    expect(h.tasks[0]).toContain(
      'run each with run_check before done; they must pass): `pnpm lint`.',
    );
    expect(h.tasks[1]).toContain(
      'Your change is already in this worktree, but it failed:\nyour CI check “pnpm lint” fails with this change:\nsrc/a.css: error',
    );
    expect(h.said).toContain(
      'The fix for “Tap target is too small” didn’t pass yet: your CI check “pnpm lint” fails with this change: src/a.css: error. Fixing that now.',
    );
    // Nothing was reset between passes: the change stayed for the repair.
    expect(h.calls.some((c) => c.fn === 'reset')).toBe(false);
    await h.pipeline.finalize();
    const pr = h.calls.find((c) => c.fn === 'prOpen');
    expect(pr && 'body' in pr ? pr.body : '').toContain('Your CI checks pass on this branch');
  });

  it('after the repair passes run out it is rolled back to the last good commit, with the reason', async () => {
    const h = harness(
      'autonomous',
      [verify([failing('target-size', [])])],
      [
        { ran: true, checks: [lint(true)] },
        { ran: true, checks: [lint(false)] },
        { ran: true, checks: [lint(false)] },
        { ran: true, checks: [lint(false)] },
        { ran: true, checks: [lint(false)] },
      ],
    );
    h.pipeline.start(['run-1-f1']);
    await h.wait();
    expect(h.state().changes[0]).toMatchObject({
      status: 'rolled-back',
      attempts: 4,
      reason: 'your CI check “pnpm lint” fails with this change: src/a.css: error',
    });
    expect(h.calls.at(-1)).toMatchObject({ fn: 'reset', to: 'base' });
    expect(h.calls.some((c) => c.fn === 'commit')).toBe(false);
    expect(h.settled).toEqual(['rolled-back:Tap target is too small']);

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
    await ok.wait();
    expect(ok.state().changes[0]?.status).toBe('verified');
    expect(ok.tasks[0]).toContain('`pnpm typecheck` (already failing; not yours to fix)');
  });

  it('the fixer can run a CI check itself before calling done', async () => {
    const h = harness(
      'autonomous',
      [verify([failing('target-size', [])])],
      [
        { ran: true, checks: [lint(true)] },
        { ran: true, checks: [lint(true)] },
        { ran: true, checks: [lint(true)] },
      ],
      { checkFirst: true },
    );
    h.pipeline.start(['run-1-f1']);
    await h.wait();
    expect(h.calls).toContainEqual({ fn: 'ci', job: 'run-1/run', only: 'pnpm lint' });
    expect(h.checked).toEqual(['ok: pnpm lint']);
    expect(h.state().changes[0]?.status).toBe('verified');
  });

  it('a fix whose probe still fails after every pass is rolled back, then retried and verified', async () => {
    const still = verify([failing('target-size', [item('compose-send', '28×20px')])]);
    const h = harness('autonomous', [still, still, still, still]);
    h.pipeline.start(['run-1-f1']);
    await h.wait();
    let change = h.state().changes[0];
    expect(change).toMatchObject({
      status: 'rolled-back',
      reason: 'the target-size probe still reports “Tap target is too small”',
      attempts: 4,
    });
    expect(h.tasks[1]).toContain('- target-size: compose-send: 28×20px');
    expect(h.state().findings[0]?.status).toBe('rolled-back');
    expect(h.calls.some((c) => c.fn === 'reset')).toBe(true);
    expect(h.calls.some((c) => c.fn === 'discard')).toBe(false);
    expect(h.calls.some((c) => c.fn === 'commit')).toBe(false);

    void h.pipeline.retry(change?.id ?? '');
    expect(h.state().changes[0]?.status).toBe('retrying');
    await h.wait();
    change = h.state().changes[0];
    expect(h.state().changes).toHaveLength(1);
    expect(change).toMatchObject({ status: 'verified', attempts: 5 });
    expect(h.tasks.at(-1)).toContain('A previous attempt was rolled back');
    expect(h.state().findings[0]?.status).toBe('verified');
  });

  it('undo reverts the commit on the branch (pushed to the open PR); redo reverts the revert', async () => {
    const h = harness('autonomous', [verify([])]);
    h.pipeline.start(['run-1-f1']);
    await h.wait();
    await h.pipeline.finalize();
    const id = h.state().changes[0]?.id ?? '';
    await h.pipeline.undo(id);
    expect(h.calls.filter((c) => c.fn === 'revertCommit').at(-1)).toMatchObject({ sha: 'c1' });
    expect(h.calls.at(-1)).toMatchObject({ fn: 'push' });
    expect(h.state().changes[0]).toMatchObject({ status: 'undone', revertSha: 'c2' });
    expect(h.state().findings[0]?.status).toBe('undone');
    expect(h.said).toContain('Undone · pushed to PR #1.');
    expect(h.prs[0]?.state).toBe('open');

    await h.pipeline.retry(id);
    expect(h.calls.filter((c) => c.fn === 'revertCommit').at(-1)).toMatchObject({ sha: 'c2' });
    expect(h.state().changes[0]).toMatchObject({ status: 'verified', sha: 'c3' });
    expect(h.state().changes[0]?.revertSha).toBeUndefined();
    expect(h.state().findings[0]?.status).toBe('pr-opened');
  });

  it('undo of a change in a merged PR opens a revert PR for that commit', async () => {
    const h = harness('autonomous', [verify([])]);
    h.pipeline.start(['run-1-f1']);
    await h.wait();
    await h.pipeline.finalize();
    const pr = h.prs[0];
    if (pr) pr.state = 'merged';
    await h.pipeline.undo(h.state().changes[0]?.id ?? '');
    expect(h.calls.at(-1)).toMatchObject({
      fn: 'revert',
      pr: 1,
      branch: 'fitts/run-run-1',
      sha: 'c1',
    });
    expect(h.said).toContain('Revert PR #2 opened.');
    expect(h.state().changes[0]).toMatchObject({ status: 'undone', revertPrNumber: 2 });
  });

  it('a run started in Autonomous asks before its PR when the mode has changed', async () => {
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
    await h.wait();
    expect(h.state().changes[0]).toMatchObject({ status: 'verified' });
    expect(await h.pipeline.finalize()).toBeUndefined();
    expect(asked).toBe(
      'Every change is checked on fitts/run-run-1. Can I push it to GitHub and open a pull request for it?',
    );
    expect(h.said.at(-1)).toBe(
      'fitts/run-run-1 has everything, checked. Ask me and I’ll open the pull request.',
    );
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
