// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Coverage, patternOf } from '../../src/agent/crawler/coverage';
import type { AxNode, AxSnapshot } from '../../src/agent/protocol';

const snap = (path: string, nodes: AxNode[]): AxSnapshot => ({
  url: `http://localhost:5173${path}`,
  path,
  title: 'App',
  headings: [],
  nodes,
  hasPassword: false,
});

/** A team card's controls: every card shares the keys, only refs and names differ. */
const team = (i: number): AxNode[] => [
  { ref: `e${i}a`, role: 'button', name: `Pokémon ${i}`, key: 'card:ul>li.team>button|button' },
  { ref: `e${i}b`, role: 'button', name: 'Move 1', key: 'card:ul>li.team>button.move|button' },
];

describe('Coverage: repeated components (Allen’s feedback, round 4)', () => {
  it('tries a control in a list of cards once, not once per card', () => {
    const c = new Coverage('http://localhost:5173');
    c.observe(snap('/builder', [...team(1), ...team(2), ...team(3), ...team(4)]));
    expect(c.controlsTried()).toEqual({ done: 0, total: 2 });
    expect(c.untried('/builder').map((u) => u.ref)).toEqual(['e4a', 'e4b']);
  });

  it('a control that re-rendered (new ref, same key) is the same control', () => {
    const c = new Coverage('http://localhost:5173');
    const save = { role: 'button', name: 'Save', key: 'button|Save|button<form' };
    c.observe(snap('/b', [{ ref: 'e1', ...save }]));
    c.markTried('/b', 'e1');
    c.observe(snap('/b', [{ ref: 'e9', ...save }]));
    expect(c.controlsTried()).toEqual({ done: 1, total: 1 });
    expect(c.untried('/b')).toEqual([]);
  });

  it('a card tried on one page is skipped on the next page that shows it', () => {
    const c = new Coverage('http://localhost:5173');
    c.observe(snap('/tournament', team(1)));
    c.markTried('/tournament', 'e1a');
    c.observe(snap('/builder', team(2)));
    expect(c.untried('/builder').map((u) => u.name)).toEqual(['Move 1']);
  });

  it('pages of one template count once two of them are tested; steps of a flow do not', () => {
    expect(patternOf('/team/a8f3k2x9')).toBe('/team/:id');
    expect(patternOf('/team/42')).toBe('/team/:id');
    expect(patternOf('/signup/step-2')).toBe('/signup/step-2');
    const c = new Coverage('http://localhost:5173');
    for (const p of [
      '/team/1',
      '/team/2',
      '/team/3',
      '/signup/step-1',
      '/signup/step-2',
      '/signup/step-3',
    ])
      c.discover(p);
    const routes = c.stateRoutes();
    expect(routes.find((r) => r.path === '/team/3')).toMatchObject({
      status: 'done',
      label: 'same page',
    });
    expect(routes.find((r) => r.path === '/team/2')?.status).toBe('queued');
    expect(routes.find((r) => r.path === '/signup/step-3')?.status).toBe('queued');
  });

  it('remaining() counts what was never tried, and where', () => {
    const c = new Coverage('http://localhost:5173');
    c.observe(
      snap('/', [
        { ref: 'a', role: 'button', name: 'A' },
        { ref: 'b', role: 'button', name: 'B' },
      ]),
    );
    c.discover('/next');
    c.markTried('/', 'a');
    expect(c.remaining()).toEqual({ controls: 1, routes: 2 });
  });
});

describe('Coverage: routes from the code (SPEC-phase4 §6.2)', () => {
  it('seeds code routes before any page, and says which a link reached', () => {
    const c = new Coverage('http://localhost:5173');
    expect(c.discover('/settings', 'code')).toBe(true);
    expect(c.discover('/orphan', 'code')).toBe(true);
    expect(c.nextRoute()).toBe('/settings');
    c.observe(snap('/', [{ ref: 'e1', role: 'link', name: 'Settings', href: '/settings' }]));
    const rows = Object.fromEntries(c.codeRoutes().map((r) => [r.path, r]));
    expect(rows['/settings']).toMatchObject({ seen: false, linked: true });
    expect(rows['/orphan']).toMatchObject({ seen: false, linked: false });
    // The visit itself doesn't make a page "linked"; a link on a page does.
    c.observe(snap('/orphan', []));
    expect(c.codeRoutes().find((r) => r.path === '/orphan')).toMatchObject({
      seen: true,
      linked: false,
    });
    // The same route named by both: one row, from the code, linked.
    c.observe(snap('/x', [{ ref: 'e2', role: 'link', name: 'Orphan', href: '/orphan' }]));
    expect(c.codeRoutes().find((r) => r.path === '/orphan')?.linked).toBe(true);
    expect(c.stateRoutes().filter((r) => r.path === '/orphan')).toHaveLength(1);
  });

  it('a skipped code route says so', () => {
    const c = new Coverage('http://localhost:5173');
    c.discover('/admin', 'code');
    c.skipRoute('/admin', 'you skipped it');
    expect(c.codeRoutes()[0]).toMatchObject({ path: '/admin', skipped: 'you skipped it' });
  });
});
