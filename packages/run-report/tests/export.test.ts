// A run with private values planted everywhere a real one could carry them (the brief, the code
// in a diff, the generated test, a rollback reason, source paths, the project record, the chat),
// exported, then every file of the output scanned for keys and paths.
import type { Change, CostEvent, Finding, LoggedEvent, RunEvent, RunState } from '@fitts/schema';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportRun, scanDir } from '../src/export';
import { outlinePath } from '../src/data';

const META_KEY = 'sk-meta-9f8e7d6c5b4a3f2e1d0c9b8a';
const GH_TOKEN = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ELEVEN = 'sk_0a1b2c3d4e5f60718293a4b5c6d7e8f9';
const LOGIN = 'hunter2-saved-login';
const WIN_PATH = 'C:\\Users\\Plasm\\Projects\\fitts\\demo\\chat';
const MAC_PATH = '/Users/allen/Library/Application Support/Fitts/projects/demo';
const PLANTED = [META_KEY, GH_TOKEN, ELEVEN, LOGIN, 'Plasm', '/Users/allen', 'Application Support'];

let root: string;
let runDir: string;
let out: string;
let html: string;

const ledger = (i: number, over: Partial<CostEvent> = {}): CostEvent => ({
  ts: new Date(Date.UTC(2026, 10, 2, 12, 0, i)).toISOString(),
  runId: 'run-3',
  projectId: 'demo-chat',
  task: 'review',
  phase: 'reviewers',
  provider: 'meta',
  model: 'muse-spark-1.3',
  contributor: false,
  inputTokens: 1000 + i,
  cachedTokens: 0,
  outputTokens: 200,
  reasoningTokens: 0,
  usd: 0.01,
  latencyMs: 1200,
  priceTable: '2026-10-28',
  ...over,
});

const finding = (id: string, over: Partial<Finding> = {}): Finding => ({
  id,
  runId: 'run-3',
  severity: 3,
  lens: 'accessibility',
  heuristic: 'H4',
  title: `Finding ${id}`,
  finding: `The problem in ${id}.`,
  fix: 'Fix it.',
  route: '/compose',
  agreement: { agreeing: 2, total: 5, who: ['Novice', 'Accessibility'], measured: true },
  evidence: ['text contrast 3.6:1 (expected at least 4.5:1)'],
  stepIndex: 1,
  atMs: 1000,
  status: 'open',
  lane: 'shown',
  ...over,
});

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'run-report-'));
  const project = join(root, 'projects', 'demo-chat');
  runDir = join(project, 'runs', 'run-3');
  out = join(root, 'out');
  mkdirSync(join(runDir, 'assets'), { recursive: true });
  mkdirSync(join(runDir, 'shots'), { recursive: true });
  writeFileSync(
    join(project, 'project.json'),
    JSON.stringify({
      id: 'demo-chat',
      name: 'Demo chat',
      folder: WIN_PATH,
      framework: 'Vite + React 19',
      brief: { summary: `Grandparents texting family. Key for staging: ${META_KEY}` },
      login: { user: 'allen', password: LOGIN },
    }),
  );
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  writeFileSync(join(runDir, 'assets', 'shot-_compose.jpg'), jpeg);
  writeFileSync(join(runDir, 'assets', 'after-f1.jpg'), jpeg);
  writeFileSync(join(runDir, 'shots', '1.jpg'), jpeg);
  writeFileSync(join(root, 'secret.txt'), META_KEY);
  // SAM answers in the box's own pixels: this outline belongs at (500, 100).
  writeFileSync(
    join(runDir, 'assets', 'mask-f1.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600"><path d="M0 0L80 0L80 30L0 30Z" fill="red"/></svg>',
  );
  writeFileSync(
    join(runDir, 'assets', 'mask-f2.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1" onload="alert(1)"/><script>alert(1)</script></svg>',
  );

  const asset = (name: string) => `fitts-asset://demo-chat/run-3/assets/${name}`;
  const f1 = finding('f1', {
    severity: 4,
    status: 'pr-opened',
    source: { file: 'src/pages/Compose.tsx', line: 35, confidence: 'plugin' },
    box: { left: 500, top: 100, width: 80, height: 30 },
    shotSize: { width: 1000, height: 600 },
    assets: {
      shot: asset('shot-_compose.jpg'),
      mask: asset('mask-f1.svg'),
      after: asset('after-f1.jpg'),
    },
    evidenceIds: ['obs-1'],
    diff: {
      files: ['src/pages/Compose.tsx'],
      lines: [
        { kind: 'del', text: `const key = "${META_KEY}";` },
        { kind: 'add', text: 'const key = import.meta.env.VITE_KEY;' },
      ],
    },
    repro: {
      start: { url: 'http://localhost:5173/compose', device: 'desktop' },
      steps: [{ n: 1, text: 'Tap **Grandma**', route: '/compose', shot: 1 }],
      expected: 'A visible focus indicator',
      actual: 'No visible change',
      environment: 'Chromium 156 · 1536×960 · mouse · light · 100%',
      confirmed: 'replayed',
      wcag: [
        {
          sc: '2.4.7',
          name: 'Focus Visible',
          url: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-visible',
        },
      ],
      playwright: `// saved to ${MAC_PATH}/repro.spec.ts\nimport { test } from '@playwright/test';\ntest('x', async ({ page }) => {\n  await page.setExtraHTTPHeaders({ Authorization: 'Bearer ${GH_TOKEN}' });\n});\n`,
    },
  });
  const f2 = finding('f2', {
    severity: 2,
    status: 'pr-opened',
    lens: 'look-and-feel',
    assets: { shot: asset('../../../secret.txt'), mask: asset('mask-f2.svg') },
    shotSize: { width: 1000, height: 600 },
  });
  const f3 = finding('f3', { title: 'Rolled back finding' });
  const f4 = finding('f4', { lane: 'suggestion', title: 'A suggestion' });
  const changes: Change[] = [
    {
      id: 'c1',
      findingIds: ['f1'],
      kind: 'fix',
      title: f1.title,
      costUsd: 0.2,
      status: 'verified',
      prNumber: 4,
      prUrl: 'https://github.com/example/demo/pull/4',
      branch: 'fitts/run-3',
      attempts: 2,
    },
    {
      id: 'c2',
      findingIds: ['f2'],
      kind: 'fix',
      title: f2.title,
      costUsd: 0.1,
      status: 'verified',
      checked: 'review',
    },
    {
      id: 'c3',
      findingIds: ['f3'],
      kind: 'fix',
      title: f3.title,
      costUsd: 0.05,
      status: 'rolled-back',
      reason: `your tests fail with this change: see ${WIN_PATH}\\test.log`,
    },
  ];
  const state: RunState = {
    runId: 'run-3',
    projectId: 'demo-chat',
    phase: 'interview',
    activity: 'idle',
    mode: 'ask-unsure',
    step: 0,
    stepEstimate: 40,
    elapsedMs: 0,
    routes: [],
    controlsTried: { done: 0, total: 0 },
    findings: [],
    changes: [],
    chat: [],
    queued: [],
    overlays: { problems: [] },
    fixingCount: 0,
    cost: {
      spentUsd: 0,
      capUsd: 5,
      byPhase: { fixes: 0, reviewers: 0, crawling: 0, summing: 0, media: 0 },
    },
    brief: {},
    fittsTyping: false,
    driverClicks: [],
  };
  const events: RunEvent[] = [
    { type: 'run.started', state },
    {
      type: 'chat.item',
      item: { id: 'u1', type: 'fitts.message', text: `Saved your key ${ELEVEN}` },
    },
    { type: 'step.started', step: 12, stepEstimate: 40 },
    { type: 'route.discovered', route: { path: '/compose', depth: 1, status: 'done', issues: 3 } },
    {
      type: 'observation.added',
      observation: {
        id: 'obs-1',
        step: 1,
        route: '/compose',
        kind: 'keyboard',
        text: 'Noticed **Grandma** shows no focus when tabbed to',
        severityHint: 3,
      },
    },
    {
      type: 'observation.added',
      observation: {
        id: 'obs-2',
        step: 2,
        route: '/compose',
        kind: 'console-error',
        text: `Noticed an error: ENOENT ${MAC_PATH}/x.json`,
        severityHint: 2,
        findingId: 'f1',
      },
    },
    ...[f1, f2, f3, f4].map((f): RunEvent => ({ type: 'finding.created', finding: f })),
    ...changes.map((c): RunEvent => ({ type: 'change.created', change: c })),
    { type: 'ledger.entry', entry: ledger(1, { task: 'interview', phase: 'crawling' }) },
    { type: 'ledger.entry', entry: ledger(2) },
    {
      type: 'ledger.entry',
      entry: ledger(3, {
        task: 'fix',
        phase: 'fixes',
        model: 'muse-wonder-1.0',
        findingId: 'f1',
        usd: 0.2,
      }),
    },
    {
      type: 'ledger.entry',
      entry: ledger(4, {
        task: 'sam',
        phase: 'media',
        model: 'sam-3.1',
        usd: 0.0025,
        inputTokens: 0,
        outputTokens: 0,
      }),
    },
    {
      type: 'cost',
      cost: {
        spentUsd: 0.2225,
        capUsd: 5,
        byPhase: { fixes: 0.2, reviewers: 0.01, crawling: 0.01, summing: 0, media: 0.0025 },
      },
    },
  ];
  const lines = events.map((event, i): LoggedEvent => ({
    v: 1,
    seq: i + 1,
    ts: Date.UTC(2026, 10, 2, 12, 0, 0) + i * 30_000,
    projectId: 'demo-chat',
    runId: 'run-3',
    event,
  }));
  writeFileSync(
    join(runDir, 'events.ndjson'),
    lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
  );

  exportRun(runDir, out, { now: new Date(Date.UTC(2026, 10, 3)) });
  html = readFileSync(join(out, 'index.html'), 'utf8');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

describe('exportRun', () => {
  it('writes no key-like strings and no local paths anywhere', () => {
    expect(scanDir(out)).toEqual([]);
    for (const f of files(out).filter((x) =>
      ['.html', '.css', '.json', '.svg'].includes(extname(x)),
    )) {
      const text = readFileSync(f, 'utf8');
      for (const p of PLANTED) expect(text, `${relative(out, f)} contains ${p}`).not.toContain(p);
      expect(text).not.toMatch(/[A-Za-z]:[\\/](Users|Windows|Program)/);
    }
  });

  it('is self-contained: every file it points at is in the folder', () => {
    const refs = [...html.matchAll(/\s(?:src|href)="([^"#][^"]*)"/g)].map((m) => m[1] ?? '');
    const local = refs.filter((r) => !/^https:\/\//.test(r));
    expect(local.length).toBeGreaterThan(3);
    for (const r of local) expect(existsSync(join(out, r)), r).toBe(true);
    // Outside links are only references (WCAG, the PR), never loaded resources.
    expect(html).not.toMatch(/\ssrc="https?:/);
    expect(html).not.toMatch(/<script/i);
    const css = readFileSync(join(out, 'report.css'), 'utf8');
    for (const m of css.matchAll(/url\('([^']+)'\)/g))
      expect(existsSync(join(out, m[1] ?? ''))).toBe(true);
  });

  it('never copies a file from outside the run, and never inlines an unsafe outline', () => {
    expect(readdirSync(join(out, 'assets'))).not.toContain('secret.txt');
    expect(html).not.toContain('onload');
    expect(html).not.toContain('alert(1)');
  });

  it('shows each finding with its screen, outline, noticed lines, repro, test and diff', () => {
    expect(html).toContain('id="f-f1"');
    expect(html).toContain('Noticed <strong>Grandma</strong> shows no focus when tabbed to');
    expect(html).toContain('Tap <strong>Grandma</strong>');
    expect(html).toContain('Replayed and seen again');
    expect(html).toContain('The Playwright test Fitts wrote');
    expect(html).toContain('import { test } from &#39;@playwright/test&#39;');
    expect(html).toContain('const key = import.meta.env.VITE_KEY;');
    expect(html).toContain('src/pages/Compose.tsx:35');
    // The outline, moved from the box's own pixels onto the box.
    expect(html).toContain('d="M500 100L580 100L580 130L500 130Z"');
  });

  it('labels each change as the pipeline left it, with its evidence', () => {
    expect(html).toContain('Verified');
    expect(html).toContain('“Finding f1” is gone');
    expect(html).toContain('It took 2 passes');
    expect(html).toContain('pull request #4');
    expect(html).toContain('Checked by review');
    expect(html).toContain('not measured');
    expect(html).toContain('Rolled back: your tests fail with this change');
  });

  it('lists every model call and which models did what', () => {
    expect(html.match(/<tr><td class="n">\d+<\/td>/g)).toHaveLength(4);
    expect(html).toContain('Muse Wonder 1.0');
    expect(html).toContain('writing fixes');
    expect(html).toContain('SAM 3.1');
    expect(html).toContain('outlining elements');
    expect(html).toContain('$0.223');
  });

  it('keeps suggestions apart from findings', () => {
    expect(html).toContain('id="suggestions"');
    expect(html).not.toContain('id="f-f4"');
  });

  it('writes meta.json for the site’s list', () => {
    const meta = JSON.parse(readFileSync(join(out, 'meta.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(meta).toMatchObject({
      id: 'demo-chat-run-3',
      project: 'Demo chat',
      shown: 3,
      verified: 1,
      review: 1,
      rolledBack: 1,
    });
  });

  it('won’t overwrite a folder that isn’t an earlier report', () => {
    const other = join(root, 'other');
    mkdirSync(other);
    writeFileSync(join(other, 'notes.txt'), 'mine');
    expect(() => exportRun(runDir, other)).toThrow(/not touching it/);
    expect(readFileSync(join(other, 'notes.txt'), 'utf8')).toBe('mine');
  });
});

describe('scanDir', () => {
  it('finds a leak in written files', () => {
    const dir = join(root, 'leaky');
    mkdirSync(dir);
    writeFileSync(join(dir, 'index.html'), `<p>${META_KEY} at ${WIN_PATH}</p>`);
    const kinds = scanDir(dir).map((l) => l.kind);
    expect(kinds).toContain('key');
    expect(kinds).toContain('path');
  });
});

describe('outlinePath', () => {
  it('leaves an outline already on the page where it is', () => {
    const svg = '<svg><path d="M500 100L580 100L580 130Z"/></svg>';
    expect(outlinePath(svg, { left: 500, top: 100, width: 80, height: 30 })).toBe(
      'M500 100L580 100L580 130Z',
    );
  });
  it('refuses path data that isn’t a plain outline', () => {
    expect(outlinePath('<svg><path d="M0 0 url(javascript:x)"/></svg>', undefined)).toBeUndefined();
  });
});
