// @vitest-environment node
// Applying a direction (SPEC-phase2 §8.3): the redesign job's checks, and the pipeline running it
// alone and first, with wording cards, "Adjust it", and later fixes stacked on its branch.
import {
  reduce,
  type Finding,
  type ProbeResult,
  type RunEvent,
  type RunState,
} from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import { FixPipeline, type Fixer, type Redesigner } from '../../src/agent/fix/pipeline';
import {
  fixedByRedesign,
  judgeRedesign,
  judgeStyle,
  redesignPrBody,
  redesignTask,
} from '../../src/agent/fix/redesign';
import type { FixCall, TestRun, VerifyPagesResult } from '../../src/agent/protocol';
import type { Check } from '../../src/agent/review/aggregate';
import type { Direction } from '../../src/agent/review/themefit';
import { testDirection } from './design';
import type { Site } from '../../src/agent/site-client';

const direction: Direction = testDirection('a', 'Quiet stone');

const finding = (id: string, route: string, over: Partial<Finding> = {}): Finding => ({
  id,
  runId: 'run-1',
  severity: 2,
  heuristic: 'H7',
  lens: 'ergonomics',
  title: 'Tap target is too small',
  finding: 'This control is 28×20px.',
  fix: 'Make it 44px.',
  route,
  agreement: { agreeing: 1, total: 5, who: ['Probe'] },
  evidence: ['28×20px'],
  stepIndex: 1,
  atMs: 1000,
  status: 'open',
  lane: 'shown',
  ...over,
});

const item = (ref: string, measured: string) => ({ ref, selector: '', measured, expected: '' });
const result = (route: string, probe: ProbeResult['probe'], items: ReturnType<typeof item>[]) => ({
  evidenceId: 'e',
  probe,
  route,
  pass: items.length === 0,
  items,
});
const page = (
  route: string,
  results: ReturnType<typeof result>[] = [],
  over: Partial<VerifyPagesResult['pages'][number]> = {},
) => ({ route, loaded: true, results, focus: [], viewport: [], jpegBase64: 'AFTER', ...over });

const small = item('send', '28×20px');
/** Before the redesign, both pages have a small tap target. */
const baseline = (route: string): ProbeResult[] => [result(route, 'target-size', [small])];
/** By default the redesign fixes the one on / but not the one on /about. */
const stillOnAbout = (): VerifyPagesResult => ({
  ok: true,
  pages: [page('/'), page('/about', [result('/about', 'target-size', [small])])],
});
const check = (route: string): Check => ({
  probe: 'target-size',
  title: 'Tap target is too small',
  routes: [route],
  hrefs: [],
});

describe('the style check', () => {
  const inv = (route: string, summary: string) => ({
    ...result(route, 'font-inventory', []),
    summary,
  });
  const spec = direction.spec;
  const p = spec.palette;
  const styled = `2 font families (shippori mincho, zen kaku gothic new), 5 sizes; colors ${p.bg} ${p.text}`;

  it('passes when the direction’s fonts and colors show on most pages', () => {
    const after = {
      ok: true,
      pages: [page('/', [inv('/', styled)]), page('/a', [inv('/a', styled)])],
    };
    expect(judgeStyle(after, spec)).toBeNull();
  });

  it('fails when the old fonts or colors are still showing', () => {
    const old = '2 font families (comic sans ms, arial), 9 sizes; colors #ff00ff #00ff00';
    const after = { ok: true, pages: [page('/', [inv('/', old)]), page('/a', [inv('/a', old)])] };
    expect(judgeStyle(after, spec)).toMatch(/fonts .* aren’t showing/);
    const fontsOnly =
      '2 font families (shippori mincho, zen kaku gothic new), 5 sizes; colors #ff00ff';
    expect(judgeStyle({ ok: true, pages: [page('/', [inv('/', fontsOnly)])] }, spec)).toMatch(
      /colors aren’t showing/,
    );
  });

  it('doesn’t hold a font it couldn’t download against the redesign', () => {
    const half = `1 font families (zen kaku gothic new), 5 sizes; colors ${p.bg}`;
    const after = { ok: true, pages: [page('/', [inv('/', half)])] };
    expect(judgeStyle(after, spec, { fonts: [], missing: ['Shippori Mincho'] })).toBeNull();
  });
});

describe('redesign checks (§8.3)', () => {
  it('passes when every page renders and nothing new at severity 2 or higher appears', () => {
    const after: VerifyPagesResult = { ok: true, pages: [page('/'), page('/about')] };
    expect(judgeRedesign(after, baseline)).toBeNull();
  });

  it('fails on a page that didn’t render, or a new problem on any page', () => {
    expect(
      judgeRedesign(
        { ok: true, pages: [page('/'), page('/about', [], { loaded: false })] },
        baseline,
      ),
    ).toBe('/about didn’t render');
    expect(
      judgeRedesign(
        {
          ok: true,
          pages: [
            page('/about', [result('/about', 'contrast', [item('h', 'text contrast 2.1:1')])]),
          ],
        },
        baseline,
      ),
    ).toBe('it caused new problems: Text is too faint to read on /about');
    // A problem the page already had isn't new.
    expect(
      judgeRedesign(
        { ok: true, pages: [page('/', [result('/', 'target-size', [small])])] },
        baseline,
      ),
    ).toBeNull();
    expect(
      judgeRedesign({ ok: false, error: 'the dev server didn’t start', pages: [] }, baseline),
    ).toBe('the dev server didn’t start');
  });

  it('finds the open findings the new look fixed', () => {
    const findings = [
      finding('f1', '/'),
      finding('f2', '/about'),
      finding('f3', '/', { status: 'dismissed' }),
    ];
    const checks = new Map([
      ['f1', check('/')],
      ['f2', check('/about')],
      ['f3', check('/')],
    ]);
    const after: VerifyPagesResult = {
      ok: true,
      pages: [page('/'), page('/about', [result('/about', 'target-size', [small])])],
    };
    expect(fixedByRedesign(after, findings, checks)).toEqual(['f1']);
  });

  it('the task carries the brief, direction and pages; the PR body has no AI attribution', () => {
    const brief = { for: 'A portfolio', who: 'Recruiters', feel: 'Confident' };
    const t = redesignTask({
      brief,
      why: 'Too loud.',
      direction,
      routes: ['/', '/about'],
      adjust: 'Bigger headings',
    });
    expect(t).toContain('Quiet stone');
    expect(t).toContain(`--bg: ${direction.spec.palette.bg};`);
    expect(t).toContain('### shape: Organic blobs');
    expect(t).toContain('Pages (every one must still work): /, /about');
    expect(t).toContain('The user asked for an adjustment: "Bigger headings"');
    const body = redesignPrBody({
      why: 'Too loud.',
      direction,
      summary: 'Added a Quiet stone theme and made it the default.',
      routes: ['/', '/about'],
      wording: [{ path: 'src/a.tsx', from: 'Party packages', to: 'Service options' }],
      fixed: [finding('f1', '/')],
    });
    expect(body).toContain('redesign: Quiet stone');
    expect(body).toContain(
      "Built from Fitts's design library: Oat, clay and charcoal, Mincho and gothic",
    );
    expect(body).toContain('"Party packages" → "Service options"');
    expect(body).toContain('Tap target is too small (/)');
    expect(body).not.toMatch(/generated|co-authored|claude|anthropic/i);
  });
});

/** A fake main for the pipeline: jobs, page verification by pass, and a PR registry. */
function harness(passes: VerifyPagesResult[], testRuns: TestRun[] = []) {
  let state = {
    runId: 'run-1',
    mode: 'ask-unsure',
    activity: 'acting',
    findings: [finding('f1', '/'), finding('f2', '/about')],
    changes: [],
    chat: [],
    fixingCount: 0,
  } as unknown as RunState;
  const calls: FixCall[] = [];
  let jobs = 0;
  let prs = 0;
  const site = {
    fix: (call: FixCall) => {
      calls.push(call);
      switch (call.fn) {
        case 'prepare':
          jobs += 1;
          return Promise.resolve({ job: `run-1/${call.findingId}`, branch: call.branch });
        case 'verifyPages':
          return Promise.resolve(passes.shift() ?? stillOnAbout());
        case 'tests':
          return Promise.resolve(testRuns.shift() ?? { ran: false, ok: true, summary: '' });
        case 'assets':
          return Promise.resolve({ fontsCss: '/fitts/fonts.css', fonts: [], missing: [] });
        case 'verify':
          return Promise.resolve({ ok: true, results: [], focus: [], viewport: [], links: {} });
        case 'patch':
        case 'write':
          return Promise.resolve({ ok: true });
        case 'commit':
          return Promise.resolve({ ok: true, sha: 'abc' });
        case 'diff':
          return Promise.resolve('');
        case 'prOpen':
          prs += 1;
          return Promise.resolve({ number: prs, url: `dry-run://pr/${prs}` });
        case 'prMerged':
          return Promise.resolve(false);
        default:
          return Promise.resolve(true);
      }
    },
  } as unknown as Site;
  const redesigns: string[] = [];
  const redesigner: Redesigner = async (task, tools) => {
    redesigns.push(task);
    await tools.write('src/themes/quiet/theme.css', ':root{}');
    return {
      patched: 1,
      summary: 'Added a Quiet stone theme and made it the default.',
      wording:
        redesigns.length === 1 ? [{ path: 'src/Hero.tsx', from: 'Party time', to: 'Welcome' }] : [],
    };
  };
  const fixer: Fixer = async (_task, tools) => {
    await tools.patch('src/a.css', 'a', 'b');
    return { patched: 1, summary: 'Padded it.' };
  };
  const said: string[] = [];
  let ids = 0;
  const pipeline = new FixPipeline(
    {
      state: () => state,
      emit: (events: RunEvent[]) => {
        for (const e of events) state = reduce(state, e) ?? state;
      },
      say: (t) => said.push(t),
      id: () => `item-${(ids += 1)}`,
      ask: () => Promise.resolve(true),
      baseline,
      costOf: () => 0.5,
      idle: () => undefined,
      restingActivity: () => 'acting',
    },
    site,
    fixer,
    new Map([
      ['f1', check('/')],
      ['f2', check('/about')],
    ]),
    redesigner,
  );
  const request = {
    brief: { for: 'A portfolio', who: 'Recruiters', feel: 'Confident' },
    why: 'Too loud.',
    direction,
    routes: ['/', '/about'],
    images: [],
    before: { '/': 'fitts-asset://p/run-1/shot-_.jpg' },
    saveShot: (route: string) => Promise.resolve(`fitts-asset://p/run-1/after${route}.jpg`),
  };
  return { pipeline, state: () => state, calls, said, redesigns, request, jobs: () => jobs };
}

describe('the redesign job (§8.3, §9.2)', () => {
  it('runs alone, checks every page, credits the findings it fixed, and opens one PR', async () => {
    const h = harness([
      { ok: true, pages: [page('/'), page('/about', [result('/about', 'target-size', [small])])] },
    ]);
    expect(await h.pipeline.redesign(h.request)).toBe('verified');
    const s = h.state();
    const progress = s.chat.find((c) => c.type === 'progress');
    expect(progress).toMatchObject({ title: 'Applying the look' });
    expect(progress?.type === 'progress' && progress.items.every((i) => i.state === 'done')).toBe(
      true,
    );
    const change = s.changes.find((c) => c.kind === 'redesign');
    expect(change).toMatchObject({
      title: 'Redesign: Quiet stone',
      status: 'verified',
      branch: 'fitts/redesign-quiet-stone',
      findingIds: ['f1'],
      prNumber: 1,
      pages: [
        {
          route: '/',
          before: 'fitts-asset://p/run-1/shot-_.jpg',
          after: 'fitts-asset://p/run-1/after/.jpg',
        },
        { route: '/about', after: 'fitts-asset://p/run-1/after/about.jpg' },
      ],
    });
    // f1 is fixed by the new look; f2 still needs its own fix.
    expect(s.findings.find((f) => f.id === 'f1')).toMatchObject({
      status: 'pr-opened',
      prNumber: 1,
    });
    expect(s.findings.find((f) => f.id === 'f2')?.status).toBe('open');
    expect(s.chat.find((c) => c.type === 'wording')).toMatchObject({
      from: 'Party time',
      to: 'Welcome',
    });
    expect(s.changes.find((c) => c.kind === 'wording')?.status).toBe('verified');
    expect(h.said.at(-1)).toBe(
      'Your site now uses Quiet stone, and every page still works. The new look also fixed 1 of the problems I found. Pull request #1 is open.',
    );
    expect(h.calls.find((c) => c.fn === 'commit')).toMatchObject({
      message: 'Redesign: Quiet stone (Fitts: look and feel)',
    });
    // The direction's fonts go into the worktree before the redesigner starts.
    const fns = h.calls.map((c) => c.fn);
    expect(fns.indexOf('assets')).toBeGreaterThan(fns.indexOf('prepare'));
    expect(fns.indexOf('assets')).toBeLessThan(fns.indexOf('verifyPages'));
    expect(h.calls.find((c) => c.fn === 'assets')).toMatchObject({
      fonts: [
        { family: 'Shippori Mincho', id: 'shippori-mincho' },
        { family: 'Zen Kaku Gothic New', id: 'zen-kaku-gothic-new' },
      ],
      three: false,
    });
  });

  it('later fixes start from the redesign’s branch and their PRs stack on it', async () => {
    const h = harness([]);
    await h.pipeline.redesign(h.request);
    h.pipeline.start(['f1', 'f2']);
    for (let i = 0; i < 100 && h.pipeline.busy; i++) await new Promise((r) => setTimeout(r, 2));
    // f1 was fixed by the redesign (its page has no problems after), so only f2 runs.
    const prepares = h.calls.filter((c) => c.fn === 'prepare');
    expect(prepares.map((c) => c.fn === 'prepare' && c.findingId)).toEqual(['redesign', 'f2']);
    expect(prepares[1]).toMatchObject({ base: 'fitts/redesign-quiet-stone' });
    expect(h.calls.filter((c) => c.fn === 'prOpen').at(-1)).toMatchObject({
      base: 'fitts/redesign-quiet-stone',
    });
  });

  it('a failed first pass gets a second with the reason; two failures roll it back', async () => {
    const broken: VerifyPagesResult = {
      ok: true,
      pages: [page('/'), page('/about', [], { loaded: false })],
    };
    const retried = harness([broken]);
    expect(await retried.pipeline.redesign(retried.request)).toBe('verified');
    expect(retried.redesigns[1]).toContain('it failed verification: /about didn’t render');
    expect(retried.said[0]).toBe(
      'The first pass broke something (/about didn’t render). Fixing that now.',
    );

    const failed = harness([broken, broken]);
    expect(await failed.pipeline.redesign(failed.request)).toBe('rolled-back');
    expect(failed.calls.some((c) => c.fn === 'discard')).toBe(true);
    expect(failed.state().changes[0]).toMatchObject({
      kind: 'redesign',
      status: 'rolled-back',
      reason: '/about didn’t render',
    });
    expect(failed.calls.some((c) => c.fn === 'prOpen')).toBe(false);
    // Fixes then start from the project's own HEAD.
    failed.pipeline.start(['f1']);
    for (let i = 0; i < 100 && failed.pipeline.busy; i++)
      await new Promise((r) => setTimeout(r, 2));
    expect(failed.calls.filter((c) => c.fn === 'prepare').at(-1)).not.toHaveProperty('base');
  });

  it('“Undo this” on a wording card puts just that line back and updates the PR', async () => {
    const h = harness([]);
    await h.pipeline.redesign(h.request);
    const card = h.state().chat.find((c) => c.type === 'wording');
    expect(await h.pipeline.decideWording(card?.id ?? '', 'undo')).toBe(true);
    expect(h.calls.filter((c) => c.fn === 'patch').at(-1)).toMatchObject({
      path: 'src/Hero.tsx',
      find: 'Welcome',
      replace: 'Party time',
    });
    expect(h.calls.at(-1)).toMatchObject({ fn: 'push' });
    expect(h.state().changes.find((c) => c.kind === 'wording')?.status).toBe('undone');
  });

  it('“Adjust it” re-runs the redesigner; a failing adjustment is reset, a passing one pushed', async () => {
    const h = harness([]);
    await h.pipeline.redesign(h.request);
    expect(h.pipeline.canAdjust).toBe(true);
    await h.pipeline.adjust('For the redesign, instead use bigger headings');
    expect(h.redesigns.at(-1)).toContain('The user asked for an adjustment');
    expect(h.calls.at(-1)).toMatchObject({ fn: 'push' });

    const bad = harness([
      { ok: true, pages: [page('/'), page('/about')] },
      { ok: true, pages: [page('/', [], { loaded: false })] },
    ]);
    await bad.pipeline.redesign(bad.request);
    await bad.pipeline.adjust('For the redesign, make it darker');
    expect(bad.calls.at(-1)).toMatchObject({ fn: 'reset' });
    expect(bad.said.at(-1)).toBe(
      'I undid that adjustment: / didn’t render. The redesign is as it was.',
    );
  });

  it('undoing the redesign means later fixes start from HEAD again', async () => {
    const h = harness([]);
    await h.pipeline.redesign(h.request);
    await h.pipeline.undo('run-1-redesign');
    h.pipeline.start(['f2']);
    for (let i = 0; i < 100 && h.pipeline.busy; i++) await new Promise((r) => setTimeout(r, 2));
    expect(h.calls.filter((c) => c.fn === 'prepare').at(-1)).not.toHaveProperty('base');
  });
});

describe('the project’s own tests (§9.2)', () => {
  const pass = { ran: true, ok: true, summary: '' };
  const fail = {
    ran: true,
    ok: false,
    summary: 'FAIL theme contract: Sharp Slate > shows every logo',
  };

  it('a redesign that breaks the project’s tests gets a second pass with what failed', async () => {
    const h = harness([], [pass, fail, pass]);
    expect(await h.pipeline.redesign(h.request)).toBe('verified');
    expect(h.redesigns[1]).toContain(
      'your tests fail with this change: FAIL theme contract: Sharp Slate > shows every logo',
    );
    const body = h.calls.find((c) => c.fn === 'prOpen');
    expect(body?.fn === 'prOpen' && body.body).toContain('Your test suite still passes');
  });

  it('tests that already failed before the change don’t block it (nothing to compare)', async () => {
    const h = harness([], [fail, fail]);
    expect(await h.pipeline.redesign(h.request)).toBe('verified');
    expect(h.redesigns).toHaveLength(1);
  });
});
