// @vitest-environment node
// Repros (SPEC-phase4 §5): navigation-aware pruning, the environment line, the Playwright test
// per oracle (snapshots), and confirming by replay with a fake replayer.
import type { AppModel, Finding, Repro } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import {
  buildRepro,
  environment,
  oracleFor,
  pruneTrail,
  stepText,
  type TrailStep,
} from '../../src/agent/repro/repro';
import { askFor, confirm, replaySteps, type ReplayAnswer } from '../../src/agent/repro/replay';
import { playwrightTest } from '../../src/agent/repro/playwright';

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'run-1-f1',
  runId: 'run-1',
  severity: 3,
  lens: 'usability',
  title: 'Page shows "null" instead of real content',
  finding: 'The page shows "null".',
  fix: 'Read the right value.',
  route: '/compose/recipient',
  agreement: { agreeing: 0, total: 5, who: [], measured: true },
  evidence: [],
  elementRef: 'compose-to',
  stepIndex: 5,
  atMs: 0,
  status: 'open',
  lane: 'shown',
  ...over,
});

/** demo/chat's compose flow as the trail records it. */
const TRAIL: TrailStep[] = [
  { step: 1, route: '/', kind: 'load', to: '/', label: 'Opened /' },
  {
    step: 2,
    route: '/',
    kind: 'click',
    ref: 'inbox-settings',
    target: { role: 'button', name: 'Settings' },
    to: '/settings',
    label: 'Tapped Settings',
  },
  { step: 3, route: '/settings', kind: 'navigate', to: '/compose', label: 'Opened /compose' },
  {
    step: 4,
    route: '/compose',
    kind: 'click',
    ref: 'compose-contact-grandma',
    target: { role: 'button', name: 'Grandma' },
    label: 'Tapped Grandma',
  },
  {
    step: 5,
    route: '/compose',
    kind: 'click',
    ref: 'compose-next-1',
    target: { role: 'button', name: 'NEXT' },
    to: '/compose/recipient',
    label: 'Tapped NEXT',
  },
  {
    step: 6,
    route: '/compose/recipient',
    kind: 'type',
    ref: 'compose-body',
    target: { role: 'textbox', name: 'Message' },
    text: 'fitts-test message',
    label: 'Typed in Message',
  },
  {
    step: 7,
    route: '/compose/recipient',
    kind: 'click',
    ref: 'compose-create',
    target: { role: 'button', name: 'Create Message' },
    to: '/compose/confirm',
    label: 'Tapped Create Message',
  },
];

describe('pruning (§5.2 step 1)', () => {
  it('a page that loads directly starts from its last arrival; steps on other pages go', () => {
    const kept = pruneTrail(TRAIL, finding({ stepIndex: 6 }));
    // Arrived at step 5 (NEXT → /compose/recipient); the typing on the page stays.
    expect(kept.map((t) => t.step)).toEqual([6]);
  });

  it('a finding on the page as a whole keeps nothing but the arrival (its start URL)', () => {
    const kept = pruneTrail(TRAIL, finding({ elementRef: undefined, stepIndex: 5 }));
    expect(kept).toEqual([]);
  });

  it('a page that needs earlier steps (data) keeps the flow that reached it', () => {
    const model = {
      pages: [
        { route: '/compose/recipient', source: 'code', features: [], forms: [], gate: 'data' },
      ],
    } as unknown as AppModel;
    const kept = pruneTrail(TRAIL, finding({ stepIndex: 6 }), model);
    expect(kept.map((t) => t.step)).toEqual([4, 5, 6]);
  });

  it('turns steps into imperative lines in the site’s words', () => {
    expect(stepText(TRAIL[4]!)).toBe('Tap **NEXT**');
    expect(stepText(TRAIL[5]!)).toBe('Type “fitts-test message” in **Message**');
    expect(stepText(TRAIL[2]!)).toBe('Open /compose');
    expect(stepText({ step: 9, route: '/', kind: 'back', label: '' })).toBe(
      'Go back with the browser’s Back button',
    );
    expect(stepText({ ...TRAIL[4]!, ms: 2100 })).toBe('Tap **NEXT** (then wait about 2 s)');
  });
});

describe('the repro', () => {
  const ua = 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36';
  it('has a start, steps with shots, expected/actual from the probe, the environment and the standard', () => {
    const repro = buildRepro({
      finding: finding({ stepIndex: 6 }),
      trail: TRAIL,
      origin: 'http://localhost:5173',
      userAgent: ua,
      size: { width: 1280, height: 800 },
      item: {
        ref: 'compose-to',
        selector: 'div',
        measured: 'shows "null"',
        expected: 'real content, not a placeholder',
      },
      probe: 'placeholder-leak',
    });
    expect(repro.start).toEqual({
      url: 'http://localhost:5173/compose/recipient',
      device: 'desktop',
    });
    expect(repro.steps).toEqual([
      {
        n: 1,
        text: 'Type “fitts-test message” in **Message**',
        route: '/compose/recipient',
        target: { role: 'textbox', name: 'Message' },
        shot: 6,
      },
    ]);
    expect(repro.expected).toBe('Real content, not a placeholder');
    expect(repro.actual).toBe('Shows "null"');
    expect(repro.environment).toBe('Chromium 140 · 1280×800 · mouse · light · 100%');
    expect(repro.confirmed).toBe('observed');
    expect(repro.wcag).toBeUndefined();
    expect(repro.playwright).toContain("import { expect, test } from '@playwright/test';");
  });

  it('a contrast finding on a phone cell names WCAG 1.4.3 and the device', () => {
    const repro = buildRepro({
      finding: finding({
        title: 'Text is too faint to read',
        elementRef: 'stamp',
        route: '/',
        stepIndex: 1,
      }),
      trail: TRAIL,
      origin: 'http://localhost:5173',
      userAgent: ua,
      cell: { id: 'phone', label: 'Phone', width: 390, height: 844, mobile: true, touch: true },
      item: {
        ref: 'stamp',
        selector: 'span.stamp',
        measured: 'text contrast 2.6:1',
        expected: 'at least 4.5:1',
      },
      probe: 'contrast',
    });
    expect(repro.wcag).toEqual([
      {
        sc: '1.4.3',
        name: 'Contrast (Minimum)',
        url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum',
      },
    ]);
    expect(repro.environment).toBe('Chromium 140 · 390×844 · touch · light · 100%');
    expect(repro.start.device).toBe('phone');
  });

  it('an owner finding is confirmed by the owner, with the reviewer’s steps when the trail has none', () => {
    const repro = buildRepro({
      finding: finding({ owner: true, elementRef: undefined, route: '/settings', stepIndex: 0 }),
      trail: [],
      origin: 'http://localhost:5173',
      userAgent: ua,
      draft: {
        expected: 'Grouped settings',
        actual: 'Fourteen switches in one list',
        steps: ['Open /settings', 'Look for Sounds'],
      },
    });
    expect(repro.confirmed).toBe('owner');
    expect(repro.steps.map((s) => s.text)).toEqual(['Open /settings', 'Look for Sounds']);
    expect(repro.expected).toBe('Grouped settings');
  });

  it('environment: zoom, text spacing and reduced motion show when a cell has them', () => {
    expect(
      environment(
        {
          id: 'zoom',
          label: 'Zoom',
          width: 1280,
          height: 800,
          mobile: false,
          touch: false,
          zoom: 2,
          textSpacing: true,
          motion: 'reduce',
          scheme: 'dark',
        },
        ua,
      ),
    ).toBe('Chromium 140 · 1280×800 · mouse · dark · 200% · text spacing · reduced motion');
  });
});

describe('the Playwright test (§5.3)', () => {
  const base: Repro = {
    start: { url: 'http://localhost:5173/compose/confirm', device: 'desktop' },
    steps: [
      {
        n: 1,
        text: 'Tap **Send Text**',
        route: '/compose/confirm',
        target: { role: 'button', name: 'Send Text', testId: 'compose-send' },
        shot: 7,
      },
    ],
    expected: 'At least 24×24px',
    actual: '28×20px',
    environment: 'Chromium 140 · 1280×800 · mouse · light · 100%',
    confirmed: 'replayed',
  };
  const f = finding({
    title: 'Tap target is too small',
    route: '/compose/confirm',
    elementRef: 'compose-send',
  });

  it('target size: a test id locator and a bounding-box assertion', () => {
    const text = playwrightTest(f, base, {
      probe: 'target-size',
      item: {
        ref: 'compose-send',
        selector: '',
        measured: '28×20px',
        expected: 'at least 24×24px',
      },
    });
    expect(text).toMatchInlineSnapshot(`
      "// Tap target is too small
      // Fitts repro · Chromium 140 · 1280×800 · mouse · light · 100%
      // Steps: Tap Send Text
      import { expect, test } from '@playwright/test';

      test("Tap target is too small", async ({ page }) => {
        await page.goto("http://localhost:5173/compose/confirm");
        await page.getByTestId("compose-send").click();
        // Tap target size (WCAG 2.5.8): at least 24×24 CSS px.
        const box = await page.getByTestId("compose-send").boundingBox();
        expect(box).not.toBeNull();
        expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(24);
      });
      "
    `);
  });

  it('a phone cell sets the viewport and touch; no oracle is a fixme with the expectation', () => {
    const text = playwrightTest(
      finding({ title: 'Settings has too many toggles', route: '/settings' }),
      {
        ...base,
        steps: [{ n: 1, text: 'Open /settings', route: '/settings' }],
        expected: 'Grouped settings',
        actual: 'Fourteen in one list',
      },
      { cell: { id: 'phone', label: 'Phone', width: 390, height: 844, mobile: true, touch: true } },
    );
    expect(text).toContain(
      'test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });',
    );
    expect(text).toContain('// Expected: Grouped settings');
    expect(text).toContain("test.fixme(true, 'check by eye');");
    expect(text).not.toContain('await page.goto("/settings")');
  });

  it('typing uses fill; role locators when there is no test id; the null-leak assertion', () => {
    const text = playwrightTest(
      finding(),
      {
        ...base,
        steps: [
          {
            n: 1,
            text: 'Type “hello” in **Message**',
            route: '/compose/recipient',
            target: { role: 'textbox', name: 'Message' },
          },
        ],
      },
      {
        probe: 'placeholder-leak',
        item: {
          ref: 'compose-to',
          selector: 'div',
          measured: 'shows "null"',
          expected: 'real content',
        },
      },
    );
    expect(text).toContain('await page.getByRole("textbox", { name: "Message" }).fill("hello");');
    expect(text).toContain('await expect(page.getByTestId("compose-to")).not.toHaveText(');
  });
});

describe('confirming by replay (§5.2)', () => {
  const pruned = TRAIL.slice(5, 6);
  const start = { path: '/compose/recipient' };
  const answer = (over: Partial<ReplayAnswer>): ReplayAnswer => ({
    ok: true,
    path: '/compose/recipient',
    results: [],
    focus: [],
    viewport: [],
    traces: [],
    missing: [],
    ...over,
  });

  it('asks the replayer for the oracle’s probe and the trail’s steps', () => {
    const ask = askFor(
      { kind: 'probe', probe: 'placeholder-leak', title: 'x' },
      start,
      replaySteps(pruned),
    );
    expect(ask).toEqual({
      start,
      steps: [
        {
          kind: 'type',
          ref: 'compose-body',
          target: { role: 'textbox', name: 'Message' },
          text: 'fitts-test message',
        },
      ],
      probes: ['placeholder-leak'],
    });
    expect(askFor({ kind: 'probe', probe: 'focus-visible', title: 'x' }, start, [])).toMatchObject({
      focus: true,
    });
    expect(
      askFor({ kind: 'trace', probe: 'back-mid-flow', title: 'x' }, start, [], 'compose-body'),
    ).toMatchObject({ fieldValueOf: 'compose-body' });
    expect(
      oracleFor(finding(), {
        probe: 'feedback-timing',
        title: 'No loading indicator while waiting',
      }),
    ).toEqual({
      kind: 'trace',
      probe: 'feedback-timing',
      title: 'No loading indicator while waiting',
      ref: 'compose-to',
    });
  });

  it('seen again on the pruned steps → replayed; else the full trail once; else observed', async () => {
    const asked: number[] = [];
    const hit = answer({
      results: [
        {
          probe: 'placeholder-leak',
          pass: false,
          items: [
            { ref: 'compose-to', selector: '', measured: 'shows "null"', expected: 'real content' },
          ],
        },
      ],
    });
    const oracle = {
      kind: 'probe' as const,
      probe: 'placeholder-leak' as const,
      title: 'Page shows "null" instead of real content',
    };
    const base: Repro = {
      start: { url: 'x', device: 'desktop' },
      steps: [],
      expected: '',
      actual: '',
      environment: '',
      confirmed: 'observed',
    };
    const yes = await confirm(
      (ask) => {
        asked.push(ask.steps.length);
        return Promise.resolve(hit);
      },
      oracle,
      finding(),
      base,
      pruned,
      TRAIL,
      start,
    );
    expect(yes).toMatchObject({ confirmed: 'replayed', steps: pruned });
    expect(asked).toEqual([1]);
    asked.length = 0;
    const onlyFull = await confirm(
      (ask) => {
        asked.push(ask.steps.length);
        return Promise.resolve(ask.steps.length > 1 ? hit : answer({}));
      },
      oracle,
      finding(),
      base,
      pruned,
      TRAIL,
      start,
      { ddmin: false },
    );
    expect(onlyFull.confirmed).toBe('replayed');
    expect(onlyFull.steps).toBe(TRAIL);
    expect(asked).toEqual([1, 7]);
    const never = await confirm(
      () => Promise.resolve(answer({})),
      oracle,
      finding(),
      base,
      pruned,
      TRAIL,
      start,
    );
    expect(never).toMatchObject({ confirmed: 'observed', steps: pruned });
    expect(
      (
        await confirm(
          () => Promise.reject(new Error('x')),
          oracle,
          finding(),
          base,
          pruned,
          TRAIL,
          start,
        )
      ).confirmed,
    ).toBe('observed');
    expect(
      (
        await confirm(
          () => Promise.resolve(hit),
          { kind: 'none' },
          finding(),
          base,
          pruned,
          TRAIL,
          start,
        )
      ).confirmed,
    ).toBe('observed');
    expect(
      (
        await confirm(
          () => Promise.resolve(hit),
          oracle,
          finding({ owner: true }),
          base,
          pruned,
          TRAIL,
          start,
        )
      ).confirmed,
    ).toBe('owner');
  });

  it('trace oracles: a slow response with no loading indicator is seen again in the last trace', async () => {
    const oracle = {
      kind: 'trace' as const,
      probe: 'feedback-timing' as const,
      title: 'No loading indicator while waiting',
    };
    const slow = answer({
      traces: [
        {
          feedback: {
            firstChangeMs: 1800,
            busyMs: null,
            added: [],
            live: [],
            errors: [],
            moved: false,
          },
          requests: [
            {
              url: 'http://x/api/search',
              method: 'GET',
              route: '/search',
              type: 'Fetch',
              status: 200,
              startMs: 0,
              endMs: 1500,
              bytes: 10,
            },
          ],
        },
      ],
    });
    const base: Repro = {
      start: { url: 'x', device: 'desktop' },
      steps: [],
      expected: '',
      actual: '',
      environment: '',
      confirmed: 'observed',
    };
    expect(
      (await confirm(() => Promise.resolve(slow), oracle, finding(), base, pruned, TRAIL, start))
        .confirmed,
    ).toBe('replayed');
  });
});

describe('ddmin in the confirmation (U4b, SPEC-phase4 §5.2 step 3)', () => {
  const pruned = TRAIL.slice(5, 6);
  const start = { path: '/compose/recipient' };
  const answer = (over: Partial<ReplayAnswer>): ReplayAnswer => ({
    ok: true,
    path: '/compose/recipient',
    results: [],
    focus: [],
    viewport: [],
    traces: [],
    missing: [],
    ...over,
  });
  const oracle = {
    kind: 'probe' as const,
    probe: 'placeholder-leak' as const,
    title: 'Page shows "null" instead of real content',
  };
  const hit = answer({
    results: [
      {
        probe: 'placeholder-leak',
        pass: false,
        items: [
          { ref: 'compose-to', selector: '', measured: 'shows "null"', expected: 'real content' },
        ],
      },
    ],
  });
  const base: Repro = {
    start: { url: 'x', device: 'desktop' },
    steps: [],
    expected: '',
    actual: '',
    environment: '',
    confirmed: 'observed',
  };
  /** A replayer where the problem shows only when steps 4 and 6 of TRAIL are both replayed. */
  const needs =
    (steps: number[], log: number[] = []) =>
    (ask: { steps: { ref?: string; path?: string }[] }) => {
      log.push(ask.steps.length);
      const refs = new Set(ask.steps.map((s) => s.ref ?? s.path));
      const wanted = steps.map((n) => TRAIL[n - 1]).map((s) => s?.ref ?? s?.to);
      return Promise.resolve(wanted.every((r) => refs.has(r)) ? hit : answer({}));
    };

  it('the pruned steps don’t reproduce, the full trail does: ddmin shrinks the full trail', async () => {
    // A generous cap here shows where it ends; the default cap (8) is the next test.
    const r = await confirm(needs([4, 6]), oracle, finding(), base, pruned, TRAIL, start, {
      cap: 20,
    });
    expect(r.confirmed).toBe('replayed');
    expect(r.steps.map((s) => s.step)).toEqual([4, 6]);
  });

  it('ddmin stops at its cap of 8 replays', async () => {
    const log: number[] = [];
    const r = await confirm(needs([1, 7], log), oracle, finding(), base, pruned, TRAIL, start);
    expect(r.confirmed).toBe('replayed');
    // pruned (1 step), full trail, then at most 8 ddmin replays and the final confirmation.
    expect(log.length).toBeLessThanOrEqual(1 + 1 + 8 + 1);
  });

  it('a failed final confirmation keeps the steps that reproduced', async () => {
    let n = 0;
    // Seen for the full trail and during ddmin; the final confirmation replay fails.
    const flaky = (ask: { steps: unknown[] }) => {
      n += 1;
      if (ask.steps.length === 1) return Promise.resolve(answer({}));
      return Promise.resolve(n >= 5 ? answer({}) : hit);
    };
    const r = await confirm(flaky, oracle, finding(), base, pruned, TRAIL, start, { cap: 3 });
    expect(r.confirmed).toBe('replayed');
    expect(r.steps).toBe(TRAIL);
  });

  it('two steps or fewer, reviewer-only and owner findings are never shrunk', async () => {
    const two = TRAIL.slice(3, 5);
    const log: number[] = [];
    const r = await confirm(needs([4, 5], log), oracle, finding(), base, two, two, start);
    expect(r.steps).toBe(two);
    expect(log).toEqual([2]);
    const none = await confirm(needs([4]), { kind: 'none' }, finding(), base, pruned, TRAIL, start);
    expect(none.confirmed).toBe('observed');
    const owner = await confirm(
      needs([4]),
      oracle,
      finding({ owner: true }),
      base,
      pruned,
      TRAIL,
      start,
    );
    expect(owner.confirmed).toBe('owner');
  });

  it('it stops cleanly when the run stops, and waits while the run is paused for the models', async () => {
    let stopped = false;
    let waited = 0;
    const log: number[] = [];
    const replayer = (ask: { steps: { ref?: string; path?: string }[] }) => {
      if (log.length === 2) stopped = true;
      return needs([4, 6], log)(ask);
    };
    const r = await confirm(replayer, oracle, finding(), base, pruned, TRAIL, start, {
      stopped: () => stopped,
      ready: () => {
        waited += 1;
        return Promise.resolve();
      },
    });
    expect(r.confirmed).toBe('replayed');
    expect(r.steps).toBe(TRAIL);
    // The pruned replay, the full trail, one ddmin replay; then the stop ends it.
    expect(log.length).toBe(3);
    expect(waited).toBe(3);
  });
});
