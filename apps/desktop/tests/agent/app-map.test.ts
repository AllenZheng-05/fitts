// @vitest-environment node
// The App Map (SPEC-phase4 §8.2): grouping by path, templates, roll-ups, unreached reasons, and
// the report's and PR body's renderings.
import {
  appMap,
  flattenMap,
  mapMarkdown,
  mapTable,
  matchesTemplate,
  type AppModelSummary,
  type Finding,
  type RunState,
} from '@fitts/schema';
import { describe, expect, it } from 'vitest';

const finding = (id: string, route: string, over: Partial<Finding> = {}): Finding => ({
  id,
  runId: 'run-1',
  severity: 2,
  lens: 'usability',
  title: `Problem ${id}`,
  finding: 'x',
  fix: `Fix ${id}`,
  route,
  agreement: { agreeing: 1, total: 5, who: ['Probe'] },
  evidence: [],
  stepIndex: 1,
  atMs: 0,
  status: 'open',
  lane: 'shown',
  ...over,
});

const model: AppModelSummary = {
  summary: 'A messaging app.',
  commit: 'abc',
  modeled: true,
  notes: [],
  pages: [
    {
      route: '/',
      title: 'Inbox',
      source: 'both',
      features: [{ id: 'f1', name: 'Read messages', description: 'The list of conversations' }],
      forms: 0,
    },
    { route: '/contacts', title: 'Contacts', source: 'both', features: [], forms: 0 },
    { route: '/contacts/:id', source: 'code', features: [], forms: 0 },
    {
      route: '/settings/profile',
      title: 'Profile',
      source: 'code',
      features: [],
      forms: 1,
      gate: 'login',
    },
  ],
  journeys: [
    {
      id: 'j1',
      name: 'Open a contact',
      goal: 'x',
      start: '/contacts',
      steps: ['a', 'b'],
      pages: ['/contacts', '/contacts/:id'],
      priority: 1,
    },
  ],
} as unknown as AppModelSummary;

const run = (over: Partial<RunState> = {}): RunState =>
  ({
    runId: 'run-1',
    projectId: 'p',
    routes: [
      { path: '/', depth: 0, status: 'done', issues: 1 },
      { path: '/contacts', depth: 0, status: 'done', issues: 0 },
      { path: '/contacts/grandma', depth: 1, status: 'done', issues: 1 },
      { path: '/contacts/mom', depth: 1, status: 'done', issues: 0 },
    ],
    findings: [
      finding('a', '/', { severity: 3 }),
      finding('b', '/contacts/grandma', { status: 'verified', severity: 2 }),
      finding('c', '/contacts/mom', { lane: 'suggestion', severity: 1 }),
    ],
    changes: [
      {
        id: 'c1',
        findingIds: ['b'],
        kind: 'fix',
        title: 'Fixed b',
        costUsd: 0,
        status: 'verified',
      },
    ],
    cells: [{ id: 'phone', label: 'Phone', width: 390, height: 844, mobile: true, touch: true }],
    journeys: [{ id: 'j1', name: 'Open a contact', status: 'done' }],
    coverage: {
      pages: { known: 4, reached: 3 },
      journeys: { planned: 1, done: 1, failed: 0, blocked: 0 },
      controls: { done: 1, total: 1 },
      cells: { planned: 1, run: 1 },
      unreached: [{ route: '/settings/profile', why: 'login' }],
    },
    appModel: model,
    ...over,
  }) as unknown as RunState;

describe('appMap', () => {
  it('groups by path, with a group node where a parent has no page', () => {
    const root = appMap(run());
    expect(flattenMap(root).map(({ node, depth }) => `${'  '.repeat(depth)}${node.path}`)).toEqual([
      '/',
      '  /contacts',
      '    /contacts/:id',
      '  /settings',
      '    /settings/profile',
    ]);
    const settings = root.children.find((c) => c.path === '/settings');
    expect(settings?.page).toBeUndefined();
    expect(root.label).toBe('Inbox');
  });

  it('concrete pages fold into their template, which says how many', () => {
    const root = appMap(run());
    const t = root.children.find((c) => c.path === '/contacts')?.children[0];
    expect(t).toMatchObject({ path: '/contacts/:id', instances: 2 });
    expect(t?.page?.reached).toBe(true);
    expect(t?.page?.findings.map((f) => f.id)).toEqual(['b']);
    expect(matchesTemplate('/team/:id', '/team/7')).toBe(true);
    expect(matchesTemplate('/team/:id', '/team/7/edit')).toBe(false);
  });

  it('pages carry features, journeys with status, cells, findings, changes and proposed fixes', () => {
    const root = appMap(run());
    expect(root.page).toMatchObject({
      features: [{ name: 'Read messages', description: 'The list of conversations' }],
      cells: ['Phone'],
      proposed: [{ findingId: 'a', fix: 'Fix a' }],
    });
    const contact = root.children[0]?.children[0];
    expect(contact?.page?.journeys).toEqual([{ id: 'j1', name: 'Open a contact', status: 'done' }]);
    expect(contact?.page?.changes).toEqual([{ id: 'c1', title: 'Fixed b', status: 'verified' }]);
  });

  it('unreached pages say why, and have no cells', () => {
    const profile = appMap(run()).children.find((c) => c.path === '/settings')?.children[0];
    expect(profile?.page).toMatchObject({ reached: false, why: 'login', cells: [] });
  });

  it('totals roll up from children: shown findings only, worst severity, fixed and open', () => {
    const root = appMap(run());
    expect(root.totals).toEqual({ findings: 2, worst: 3, fixed: 1, open: 1 });
    expect(root.children[0]?.totals).toEqual({ findings: 1, worst: 2, fixed: 1, open: 0 });
  });

  it('without a model: the routes the run reached and every finding’s page', () => {
    const root = appMap(run({ appModel: undefined }));
    expect(flattenMap(root).map(({ node }) => node.path)).toEqual([
      '/',
      '/contacts',
      '/contacts/grandma',
      '/contacts/mom',
    ]);
  });

  it('the report’s nested list and the PR body’s table', () => {
    const root = appMap(run());
    const md = mapMarkdown(root);
    expect(md[0]).toBe('- **/** · 2 found, 1 fixed');
    expect(md).toContain('  - Does: Read messages');
    expect(md).toContain('    - **/contacts/:id** (× 2 pages) · 1 found, 1 fixed');
    expect(md).toContain('      - Fixed: Fixed b');
    expect(md).toContain('    - **/settings/profile** (not reached: login)');
    expect(mapTable(root)).toEqual([
      '| Page | Fixed | Open |',
      '| --- | --- | --- |',
      '| / | 0 | 1 |',
      '| /contacts/:id | 1 | 0 |',
    ]);
  });
});
