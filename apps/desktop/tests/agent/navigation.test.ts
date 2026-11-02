// @vitest-environment node
// Navigation analysis (SPEC-phase4 §6B.4): expected vs actual, chains, loops, Back trap,
// refresh and soft 404.
import { describe, expect, it } from 'vitest';
import {
  backTrap,
  chainProblems,
  navigationKind,
  refreshProblem,
  soft404,
  wrongPlace,
} from '../../src/agent/crawler/navigation';

describe('wrongPlace', () => {
  it('a control that goes elsewhere than its link says; none without an expected destination', () => {
    const w = wrongPlace({
      ref: 'set-contacts',
      name: 'Contacts',
      expected: '/contacts',
      arrived: '/settings/privacy',
    });
    expect(w?.measured).toBe('"Contacts" went to /settings/privacy (its link says /contacts)');
    expect(navigationKind(w?.measured ?? '')).toBe('wrong-place');
    expect(wrongPlace({ ref: 'x', name: 'Contacts', arrived: '/settings' })).toBeNull();
    expect(wrongPlace({ ref: 'x', name: 'Go', expected: '/a?x=1', arrived: '/a' })).toBeNull();
  });

  it('a login on the way to the right page is not "wrong"', () => {
    expect(
      wrongPlace({
        ref: 'x',
        name: 'Account',
        expected: '/account',
        arrived: '/login',
        redirects: ['/account', '/login'],
      }),
    ).toBeNull();
  });
});

describe('chainProblems', () => {
  it('more than two hops, a loop, an unexpected login, a lost query', () => {
    expect(
      chainProblems({ from: '/a', hops: ['/b', '/c', '/d'] }).map((i) =>
        navigationKind(i.measured),
      ),
    ).toEqual(['chain']);
    expect(
      chainProblems({ from: '/a', hops: ['/b', '/a'] }).map((i) => navigationKind(i.measured)),
    ).toEqual(['loop']);
    expect(
      chainProblems({ from: '/inbox', hops: ['/login'] }).map((i) => navigationKind(i.measured)),
    ).toEqual(['login']);
    expect(chainProblems({ from: '/inbox', hops: ['/login'], gated: true })).toEqual([]);
    expect(
      chainProblems({ from: '/s?q=tokyo', hops: ['/search'] }).map((i) =>
        navigationKind(i.measured),
      ),
    ).toEqual(['dropped']);
    expect(chainProblems({ from: '/old', hops: ['/new'] })).toEqual([]);
  });
});

describe('backTrap, refreshProblem, soft404', () => {
  it('Back that lands where it was sent forward again is a trap', () => {
    expect(backTrap({ redirectedFrom: '/old', afterBack: '/new', arrived: '/new' })?.measured).toBe(
      'Back from /new goes to /old, which sends you straight back',
    );
    expect(backTrap({ redirectedFrom: '/old', afterBack: '/', arrived: '/new' })).toBeNull();
  });

  it('a refresh that errors, goes blank or shows another page; pages inside a flow are notes only', () => {
    const base = {
      route: '/compose/confirm',
      status: 200,
      mainText: 400,
      headings: ['Confirm'],
      expectedHeadings: ['Confirm'],
    };
    expect(refreshProblem(base)).toBeNull();
    expect(refreshProblem({ ...base, mainText: 0 })?.measured).toBe(
      'refreshing /compose/confirm shows a blank page',
    );
    expect(refreshProblem({ ...base, status: 404 })?.measured).toContain('answers 404');
    expect(refreshProblem({ ...base, headings: ['Messages'] })?.measured).toContain(
      'shows a different page (Messages)',
    );
    // Inside a flow: going back to its start is fine; a blank page still isn't.
    expect(refreshProblem({ ...base, headings: ['Compose'], needsFlow: true })).toBeNull();
    expect(refreshProblem({ ...base, mainText: 0, needsFlow: true })?.measured).toBe(
      'refreshing /compose/confirm shows a blank page',
    );
  });

  it('an unknown address showing the home page with 200 is a soft 404', () => {
    const s = {
      path: '/fitts-not-a-page-1',
      status: 200,
      headings: ['Messages'],
      homeHeadings: ['Messages'],
      text: 'Messages',
    };
    expect(navigationKind(soft404(s)?.measured ?? '')).toBe('soft-404');
    expect(soft404({ ...s, status: 404 })).toBeNull();
    expect(soft404({ ...s, text: 'Page not found' })).toBeNull();
    expect(soft404({ ...s, headings: ['Oops'] })).toBeNull();
  });
});
