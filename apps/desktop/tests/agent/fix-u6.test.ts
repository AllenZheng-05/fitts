// @vitest-environment node
// SPEC-phase4 §7: the code-aware fixer. Device findings are checked in their own cell, trace
// findings by replaying their repro on the worktree, reviewer-only findings only with the
// owner's ask and labeled "Checked by review"; request_scope goes through main; the task carries
// the code context and the fixer has list_files, outline, find_component and request_scope.
import { reduce, type DeviceCell, type Finding, type RunEvent, type RunState } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import {
  fileHandlers,
  scopeFiles,
  taskContext,
  taskFile,
  type FixTools,
} from '../../src/agent/fix/fixer';
import {
  FixPipeline,
  fixSection,
  type Fixer,
  type TraceReplay,
} from '../../src/agent/fix/pipeline';
import { reviewCheck } from '../../src/agent/fix/review-check';
import type { FixCall, ReplayAnswer, VerifyResult } from '../../src/agent/protocol';
import type { Check } from '../../src/agent/review/aggregate';
import type { Site } from '../../src/agent/site-client';
import type { LlmCaller } from '../../src/agent/llm/call';

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'f1',
  runId: 'run-1',
  severity: 2,
  heuristic: 'H7',
  lens: 'ergonomics',
  title: 'Tap target is too small',
  finding: 'This control is 28×20px.',
  fix: 'Make it 44px.',
  route: '/compose',
  agreement: { agreeing: 1, total: 5, who: ['Probe'] },
  evidence: ['28×20px'],
  elementRef: 'send',
  stepIndex: 3,
  atMs: 9000,
  status: 'open',
  lane: 'shown',
  source: { file: 'src/pages/Compose.tsx', line: 131, confidence: 'plugin' },
  ...over,
});

const phone: DeviceCell = {
  id: 'phone',
  label: 'Phone',
  width: 390,
  height: 844,
  mobile: true,
  touch: true,
};

const answer = (over: Partial<ReplayAnswer> = {}): ReplayAnswer => ({
  ok: true,
  path: '/compose',
  results: [],
  focus: [],
  viewport: [],
  traces: [],
  missing: [],
  ...over,
});

function harness(o: {
  findings: Finding[];
  checks: [string, Check][];
  mode?: RunState['mode'];
  trace?: TraceReplay;
  review?: { fixed: boolean; why: string };
  fixer?: Fixer;
  grants?: (call: Extract<FixCall, { fn: 'grant' }>) => { ok: boolean; error?: string };
  ownerSays?: boolean;
}) {
  let state = {
    runId: 'run-1',
    mode: o.mode ?? 'autonomous',
    findings: o.findings,
    changes: [],
    chat: [],
    fixingCount: 0,
  } as unknown as RunState;
  const calls: FixCall[] = [];
  const asked: string[] = [];
  const site = {
    fix: (call: FixCall) => {
      calls.push(call);
      switch (call.fn) {
        case 'prepare':
          return Promise.resolve({ job: 'run-1/run', branch: 'fitts/run-run-1', sha: 'base' });
        case 'patch':
          return Promise.resolve({ ok: true });
        case 'verify':
          return Promise.resolve({
            ok: true,
            results: [],
            focus: [],
            viewport: [],
            links: {},
          } satisfies VerifyResult);
        case 'replay':
          return Promise.resolve(answer());
        case 'verifyPages':
          return Promise.resolve({
            ok: true,
            pages: [
              {
                route: '/compose',
                loaded: true,
                results: [],
                focus: [],
                viewport: [],
                jpegBase64: 'AFTER',
              },
            ],
          });
        case 'grant':
          return Promise.resolve(o.grants?.(call) ?? { ok: true });
        case 'diff':
          return Promise.resolve('+++ b/src/a.css\n-a\n+b\n');
        case 'commit':
          return Promise.resolve({ ok: true, sha: 'c1' });
        default:
          return Promise.resolve(undefined);
      }
    },
  } as unknown as Site;
  const tasks: string[] = [];
  const fixer: Fixer =
    o.fixer ??
    (async (task, tools) => {
      tasks.push(task);
      await tools.patch('src/a.css', 'a', 'b');
      return { patched: 1, summary: 'Changed it.' };
    });
  const reviewed: { finding: Finding; after: string }[] = [];
  const pipeline = new FixPipeline(
    {
      state: () => state,
      emit: (events: RunEvent[]) => {
        for (const e of events) state = reduce(state, e) ?? state;
      },
      say: () => undefined,
      id: () => `item-${Math.random()}`,
      ask: () => Promise.resolve(true),
      baseline: () => [],
      costOf: () => 0,
      idle: () => undefined,
      restingActivity: () => 'acting',
      cell: (id) => (id === 'phone' ? phone : undefined),
      traceReplay: (id) => (id === 'trace' ? o.trace : undefined),
      ...(o.review
        ? {
            checkByReview: (f: Finding, after: string) => {
              reviewed.push({ finding: f, after });
              return Promise.resolve(o.review ?? { fixed: false, why: '' });
            },
          }
        : {}),
      askItem: (text) => {
        asked.push(text);
        return Promise.resolve({ yes: o.ownerSays ?? false, itemId: 'q1' });
      },
    },
    site,
    fixer,
    new Map(o.checks),
  );
  const wait = async () => {
    for (let i = 0; i < 200 && pipeline.busy; i++) await new Promise((r) => setTimeout(r, 2));
  };
  return { pipeline, state: () => state, calls, tasks, asked, reviewed, wait };
}

const target: Check = {
  probe: 'target-size',
  title: 'Tap target is too small',
  routes: ['/compose'],
  hrefs: [],
};

describe('device findings (§7.5)', () => {
  it('a phone-only problem is fixable and verified in its own cell', async () => {
    const h = harness({
      findings: [finding({ id: 'phone-f', seenOn: 'phone' })],
      checks: [['phone-f', { ...target, device: 'phone' }]],
    });
    expect(h.pipeline.fixable(['phone-f'])).toEqual(['phone-f']);
    h.pipeline.start(['phone-f']);
    await h.wait();
    const verify = h.calls.find((c) => c.fn === 'verify');
    expect(verify).toMatchObject({ fn: 'verify', device: phone });
    expect(h.state().changes[0]).toMatchObject({ status: 'verified' });
  });

  it('a cell the run doesn’t know can’t be checked, so it isn’t fixable', () => {
    const h = harness({
      findings: [finding({ id: 'tv' })],
      checks: [['tv', { ...target, device: 'tv-4k' }]],
    });
    expect(h.pipeline.fixable(['tv'])).toEqual([]);
  });
});

describe('trace findings (§7.5)', () => {
  const traceCheck: Check = {
    probe: 'feedback-timing',
    title: 'No feedback after tapping',
    routes: ['/compose'],
    hrefs: [],
  };
  const ask = {
    start: { path: '/compose', device: null },
    steps: [{ kind: 'click' as const, ref: 'send' }],
    probes: [],
  };

  it('without a confirmed repro a trace finding isn’t fixable', () => {
    const h = harness({ findings: [finding({ id: 'trace' })], checks: [['trace', traceCheck]] });
    expect(h.pipeline.fixable(['trace'])).toEqual([]);
  });

  it('is verified by replaying its repro on the worktree: gone → verified', async () => {
    const h = harness({
      findings: [finding({ id: 'trace' })],
      checks: [['trace', traceCheck]],
      trace: { ask, seen: () => false },
    });
    expect(h.pipeline.fixable(['trace'])).toEqual(['trace']);
    h.pipeline.start(['trace']);
    await h.wait();
    expect(h.calls.find((c) => c.fn === 'replay')).toMatchObject({ fn: 'replay', ask });
    expect(h.calls.some((c) => c.fn === 'verify')).toBe(false);
    expect(h.state().changes[0]).toMatchObject({ status: 'verified' });
  });

  it('still seen on replay → rolled back with that reason', async () => {
    const h = harness({
      findings: [finding({ id: 'trace' })],
      checks: [['trace', traceCheck]],
      trace: { ask, seen: () => true },
    });
    h.pipeline.start(['trace']);
    await h.wait();
    expect(h.state().changes[0]).toMatchObject({
      status: 'rolled-back',
      reason: 'the problem still happens when I replay its steps',
    });
  });
});

describe('Checked by review (§7.5)', () => {
  const reviewerOnly = finding({ id: 'r1', title: 'The page feels cramped', source: undefined });

  it('a reviewer-only finding is fixable only when the owner asks', () => {
    const h = harness({ findings: [reviewerOnly], checks: [], review: { fixed: true, why: 'ok' } });
    expect(h.pipeline.fixable(['r1'])).toEqual([]);
    expect(h.pipeline.fixable(['r1'], { owner: true })).toEqual(['r1']);
  });

  it('a yes from the review is labeled "Checked by review", never verified by measurement', async () => {
    const h = harness({
      findings: [reviewerOnly],
      checks: [],
      review: { fixed: true, why: 'More room now.' },
    });
    h.pipeline.start(['r1'], { owner: true });
    await h.wait();
    expect(h.reviewed[0]?.after).toBe('AFTER');
    expect(h.state().changes[0]).toMatchObject({ status: 'verified', checked: 'review' });
    const section = fixSection(reviewerOnly, undefined, 'Added spacing.', 'review');
    expect(section).toContain('### Checked by review');
    expect(section).not.toMatch(/verified/i);
  });

  it('a no from the review rolls the change back with the reviewer’s reason', async () => {
    const h = harness({
      findings: [reviewerOnly],
      checks: [],
      review: { fixed: false, why: 'Still cramped on the left.' },
    });
    h.pipeline.start(['r1'], { owner: true });
    await h.wait();
    expect(h.state().changes[0]).toMatchObject({
      status: 'rolled-back',
      reason: 'the review says it isn’t fixed yet: still cramped on the left',
    });
  });

  it('Autonomous never starts a reviewer-only fix on its own', () => {
    const h = harness({ findings: [reviewerOnly], checks: [], review: { fixed: true, why: '' } });
    h.pipeline.start(['r1']);
    expect(h.pipeline.busy).toBe(false);
  });
});

describe('the allowlist from the agent side (§7.3)', () => {
  it('each job sets its finding’s own files as the scope before the fixer runs', async () => {
    const h = harness({ findings: [finding()], checks: [['f1', target]] });
    h.pipeline.start(['f1']);
    await h.wait();
    const scope = h.calls.find((c) => c.fn === 'scope');
    expect(scope).toMatchObject({ fn: 'scope', files: ['src/pages/Compose.tsx'] });
    expect(h.calls.findIndex((c) => c.fn === 'scope')).toBeLessThan(
      h.calls.findIndex((c) => c.fn === 'patch'),
    );
  });

  it('request_scope: main grants what the mode allows without asking', async () => {
    let result: { ok: boolean; error?: string } | undefined;
    const h = harness({
      findings: [finding()],
      checks: [['f1', target]],
      fixer: async (_task, tools) => {
        result = await tools.requestScope?.('src/lib/format.ts', 'the label is built there');
        return { patched: 0, summary: '' };
      },
    });
    h.pipeline.start(['f1']);
    await h.wait();
    expect(result).toEqual({ ok: true });
    expect(h.asked).toEqual([]);
  });

  it('request_scope: a refused grant asks the owner, naming the file; main decides on their answer', async () => {
    let result: { ok: boolean; error?: string } | undefined;
    const grants: Extract<FixCall, { fn: 'grant' }>[] = [];
    const h = harness({
      findings: [finding()],
      checks: [['f1', target]],
      ownerSays: true,
      grants: (call) => {
        grants.push(call);
        return call.itemId ? { ok: true } : { ok: false, error: 'needs the owner' };
      },
      fixer: async (_task, tools) => {
        result = await tools.requestScope?.('package.json', 'A script needs a flag.');
        return { patched: 0, summary: '' };
      },
    });
    h.pipeline.start(['f1']);
    await h.wait();
    expect(h.asked[0]).toBe(
      'To fix “Tap target is too small” I need to change package.json because a script needs a flag. OK?',
    );
    expect(grants.map((g) => g.itemId)).toEqual([undefined, 'q1']);
    expect(result).toEqual({ ok: true });
  });

  it('request_scope: the owner says no → refused, and main is never asked to grant it', async () => {
    let result: { ok: boolean; error?: string } | undefined;
    const grants: Extract<FixCall, { fn: 'grant' }>[] = [];
    const h = harness({
      findings: [finding()],
      checks: [['f1', target]],
      ownerSays: false,
      grants: (call) => {
        grants.push(call);
        return { ok: false, error: 'needs the owner' };
      },
      fixer: async (_task, tools) => {
        result = await tools.requestScope?.('.env', 'x');
        return { patched: 0, summary: '' };
      },
    });
    h.pipeline.start(['f1']);
    await h.wait();
    expect(grants).toHaveLength(1);
    expect(result).toEqual({ ok: false, error: 'the owner said no to changing .env' });
  });
});

describe('the task and the tools (§7.1, §7.2)', () => {
  const model = {
    summary: 'A team chat app.',
    stack: {
      framework: 'React',
      language: 'ts',
      styling: ['CSS modules'],
      router: 'react-router',
      ui: [],
      tests: [],
    },
    pages: [
      { route: '/compose', file: 'src/pages/Compose.tsx', source: 'both', features: [], forms: [] },
    ],
    tokens: [{ file: 'src/theme.css', kind: 'css-vars', names: ['--muted', '--ink'] }],
  } as never;

  it('the default scope is the chain, the page’s file and the token files', () => {
    const f = finding({
      sourceChain: [
        { kind: 'host', src: 'src/components/SendButton.tsx:12:5', component: 'SendButton' },
        { kind: 'call', src: 'src/pages/Compose.tsx:131:9' },
        { kind: 'debug', src: 'node_modules/react-dom/x.js:1' },
      ],
    });
    expect(scopeFiles(f, model)).toEqual([
      'src/pages/Compose.tsx',
      'src/components/SendButton.tsx',
      'src/theme.css',
    ]);
  });

  it('the task names the project, the chain, the tokens and the files it may change', () => {
    const f = finding({
      sourceChain: [
        { kind: 'host', src: 'src/components/SendButton.tsx:12:5', component: 'SendButton' },
      ],
    });
    const t = taskFile(f, target, { context: taskContext(f, model) });
    expect(t).toContain('About the project: A team chat app.');
    expect(t).toContain('Built with: React with CSS modules.');
    expect(t).toContain(
      'Component chain (nearest first): src/components/SendButton.tsx:12:5 (SendButton)',
    );
    expect(t).toContain(
      'Use the design tokens in src/theme.css (--muted, --ink) rather than new values.',
    );
    expect(t).toContain(
      'Files you may change: src/pages/Compose.tsx, src/components/SendButton.tsx, src/theme.css',
    );
  });

  it('outline, find_component, list_files and request_scope answer the model', async () => {
    const steps: string[] = [];
    const tools: FixTools = {
      read: () =>
        Promise.resolve(
          'import x from "./x.css";\nexport function SendButton() {\n  return null;\n}\n',
        ),
      search: (text) =>
        Promise.resolve(
          text === 'function SendButton(' ? [{ path: 'src/Send.tsx', line: 2, text }] : [],
        ),
      patch: () => Promise.resolve({ ok: true }),
      check: () => Promise.resolve({ ok: true, output: 'ok' }),
      list: () => Promise.resolve(['pages/', 'theme.css']),
      requestScope: (path) =>
        Promise.resolve(path === 'src/ok.ts' ? { ok: true } : { ok: false, error: 'no' }),
    };
    const h = fileHandlers(tools, (l) => steps.push(l));
    expect((await h['outline']?.({ path: 'src/Send.tsx' }))?.output).toContain(
      'SendButton (lines 2–4)',
    );
    expect((await h['find_component']?.({ name: 'SendButton' }))?.output).toBe(
      'src/Send.tsx:2: function SendButton(',
    );
    expect((await h['find_component']?.({ name: 'Nope' }))?.output).toBe(
      'no definition of Nope found',
    );
    expect((await h['list_files']?.({ dir: 'src' }))?.output).toBe('pages/\ntheme.css');
    expect((await h['request_scope']?.({ path: 'src/ok.ts', why: 'x' }))?.output).toBe(
      'granted: you may change src/ok.ts',
    );
    expect((await h['request_scope']?.({ path: 'src/no.ts', why: 'x' }))?.output).toBe(
      'refused: no',
    );
    expect(steps).toContain('Asking to change src/ok.ts');
  });
});

describe('reviewCheck (§7.5)', () => {
  const caller = (outputText: string) =>
    ({
      call: () => Promise.resolve({ outputText, output: [], usage: {} }),
    }) as unknown as LlmCaller;
  const input = {
    finding: { title: 'Cramped', finding: 'Too tight.', fix: 'More room.', route: '/' },
    before: 'B',
    after: 'A',
  };
  const ctx = { runId: 'r', projectId: 'p', contributor: false, allowed: () => true };

  it('reads the verdict', async () => {
    await expect(
      reviewCheck(caller('{"fixed":true,"why":"Roomier."}'), ctx, 'm', input),
    ).resolves.toEqual({
      fixed: true,
      why: 'Roomier.',
    });
  });

  it('an unreadable answer counts as not fixed (no fix is kept on a guess)', async () => {
    await expect(reviewCheck(caller('not json'), ctx, 'm', input)).resolves.toEqual({
      fixed: false,
      why: 'the review couldn’t be read',
    });
  });
});
