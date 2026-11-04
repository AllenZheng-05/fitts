// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Coverage, MAX_SAME_CONTROL, patternOf } from '../../src/agent/crawler/coverage';
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

describe('Coverage: repeat taps (Bootstrap examples: 991 of 1,000 taps on one skip link)', () => {
  it('taps one control at most MAX_SAME_CONTROL times a run, even when its key keeps changing', () => {
    const c = new Coverage('http://localhost:5173');
    let taps = 0;
    for (let i = 0; i < 10; i++) {
      // A new key each snapshot, as when a control's classes change on focus.
      c.observe(
        snap('/', [
          { ref: `e${i}`, role: 'button', name: 'Show more', key: `button|Show more|k${i}` },
        ]),
      );
      const next = c.untried('/').find((u) => u.name === 'Show more');
      if (!next) break;
      c.markTried('/', next.ref);
      taps++;
    }
    expect(taps).toBe(MAX_SAME_CONTROL);
  });

  it('counts unnamed controls apart (by key), so three icon buttons tapped leave the fourth', () => {
    const c = new Coverage('http://localhost:5173');
    const icons = [1, 2, 3, 4].map((i) => ({
      ref: `i${i}`,
      role: 'button',
      name: '',
      key: `button||icon${i}`,
    }));
    c.observe(snap('/', icons));
    for (const i of [1, 2, 3]) c.markTried('/', `i${i}`);
    expect(c.untried('/').map((u) => u.ref)).toEqual(['i4']);
  });

  it('tries a same-page anchor link (a skip link) once a run, not once a page', () => {
    const c = new Coverage('http://localhost:5173');
    const skip = (path: string): AxNode => ({
      ref: `skip${path}`,
      role: 'link',
      name: 'Skip to main content',
      href: '#main',
      key: `link|Skip|${path}`,
    });
    c.observe(snap('/', [skip('/')]));
    c.markTried('/', 'skip/');
    c.observe(
      snap('/settings', [skip('/settings'), { ref: 'save', role: 'button', name: 'Save' }]),
    );
    expect(c.untried('/settings').map((u) => u.ref)).toEqual(['save']);
    // A same-page link written with its path counts too.
    c.observe(
      snap('/rentals', [{ ref: 'top', role: 'link', name: 'Back to top', href: '/rentals#top' }]),
    );
    c.markTried('/rentals', 'top');
    expect(c.untried('/rentals')).toEqual([]);
  });
});

describe('a control that turns disabled waits (Basil & Ember, Nov 4)', () => {
  it('leaves the untried list while disabled and comes back when enabled', () => {
    const c = new Coverage('http://localhost:5173');
    const minus = (disabled: boolean): AxNode => ({
      ref: 'm',
      role: 'button',
      name: 'Decrease quantity',
      key: 'minus',
      ...(disabled ? { disabled } : {}),
    });
    c.observe(snap('/menu/margherita', [minus(false)]));
    expect(c.untried('/menu/margherita').map((u) => u.name)).toEqual(['Decrease quantity']);
    c.observe(snap('/menu/margherita', [minus(true)]));
    expect(c.untried('/menu/margherita')).toEqual([]);
    expect(c.routeDone('/menu/margherita')).toBe(true);
    c.observe(snap('/menu/margherita', [minus(false)]));
    expect(c.untried('/menu/margherita').map((u) => u.name)).toEqual(['Decrease quantity']);
  });
});

describe('a control that left the page waits for it to come back (Basil & Ember, Nov 4)', () => {
  it("a hidden card isn't offered, so its old ref (now another control's) is never tapped", () => {
    const c = new Coverage('http://localhost:5176');
    const chip = (ref: string): AxNode => ({ ref, role: 'button', name: 'Drinks', key: 'chip' });
    const card = (ref: string): AxNode => ({
      ref,
      role: 'link',
      name: 'View Margherita',
      key: 'margherita',
    });
    c.observe(snap('/menu', [chip('e10'), card('e14')]));
    c.markTried('/menu', 'e10');
    // A filter hides the card, and the re-render gives "Drinks" the card's old ref.
    c.observe(snap('/menu', [chip('e14')]));
    expect(c.untried('/menu')).toEqual([]);
    expect(c.routeDone('/menu')).toBe(true);
    // Shown again, it's offered again, under its new ref.
    c.observe(snap('/menu', [chip('e20'), card('e21')]));
    expect(c.untried('/menu').map((u) => u.ref)).toEqual(['e21']);
  });
});
