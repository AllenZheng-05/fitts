// The owner's pivot and route patterns (Allen, Nov 4): Fitts opened "/*", the catch-all route
// from the App Model, five times after "stay on checkout".
import { describe, expect, it } from 'vitest';
import type { AxNode, AxSnapshot } from '../../src/agent/protocol';
import { Coverage, isPattern } from '../../src/agent/crawler/coverage';
import { pivotFrom, taskFrom } from '../../src/agent/crawler/focus';

const snap = (path: string, nodes: AxNode[], title = 'Basil & Ember'): AxSnapshot => ({
  url: `http://localhost:5176${path}`,
  path,
  title,
  headings: [title],
  nodes,
  hasPassword: false,
});
const button = (name: string): AxNode => ({ ref: name, role: 'button', name, key: name });

describe('route patterns are never pages', () => {
  it('catch-alls and parameters with no value', () => {
    for (const p of ['*', '/*', '/docs/*', '/menu/:id', '/%2A']) expect(isPattern(p)).toBe(true);
    for (const p of ['/', '/menu', '/menu/margherita', '/time/10:30'])
      expect(isPattern(p)).toBe(false);
  });
  it('the App Model\'s "/*" and "*" never join the crawl', () => {
    const c = new Coverage('http://localhost:5176');
    expect(c.discover('/*', 'code')).toBe(false);
    expect(c.discover('*', 'code')).toBe(false);
    expect(c.discover('/menu/:id', 'code')).toBe(false);
    expect(c.discover('/checkout', 'code')).toBe(true);
    expect(c.stateRoutes().map((r) => r.path)).toEqual(['/checkout']);
  });
});

describe('a URL that shows a page already seen is that page, visited', () => {
  it('the catch-all showing Home is done, and the crawl moves on', () => {
    const c = new Coverage('http://localhost:5176');
    const home = [button('Order pickup'), button('Reserve a table')];
    c.observe(snap('/', home));
    c.discover('/specials');
    c.discover('/cart');
    c.observe(snap('/specials', home));
    const specials = c.stateRoutes().find((r) => r.path === '/specials');
    expect(specials?.status).toBe('done');
    expect(specials?.label).toBe('same page as /');
    expect(c.untried('/specials')).toEqual([]);
    c.markTried('/', 'Order pickup');
    c.markTried('/', 'Reserve a table');
    expect(c.nextRoute()).toBe('/cart');
  });
});

describe("the owner's focus keeps the crawl inside it", () => {
  const site = () => {
    const c = new Coverage('http://localhost:5176');
    c.observe(snap('/', [button('Order pickup')]));
    c.discover('/menu');
    c.discover('/about');
    return c;
  };
  it('stays on checkout while other pages wait, then lifts itself once covered', () => {
    const c = site();
    c.focus(['/checkout']);
    expect(c.nextRoute()).toBe('/checkout');
    // Back on Home: nothing there is tried, so the crawl heads back to checkout.
    expect(c.untried('/')).toEqual([]);
    c.observe(snap('/checkout', [button('Place pickup order')], 'Checkout'));
    expect(c.nextRoute()).toBe('/checkout');
    c.markTried('/checkout', 'Place pickup order');
    expect(c.focusCovered()).toBe(true);
    expect(c.nextRoute()).toBe('/');
    expect(c.takeLifted()).toEqual(['/checkout']);
    expect(c.takeLifted()).toBeUndefined();
    expect(c.focused()).toBeUndefined();
  });
  it('pages under a focus route are inside it; lifting brings the rest back', () => {
    const c = site();
    c.focus(['/menu']);
    expect(c.inFocus('/menu/margherita')).toBe(true);
    expect(c.inFocus('/about')).toBe(false);
    c.unfocus();
    expect(c.inFocus('/about')).toBe(true);
  });
});

describe("reading a pivot from the owner's words", () => {
  const pages = [
    { route: '/' },
    { route: '/menu', title: 'Menu' },
    { route: '/cart', title: 'Your cart' },
    { route: '/checkout', title: 'Checkout' },
    { route: '/about', title: 'About & Contact' },
    { route: '/*', title: 'Home' },
  ];
  it('"stay on checkout" focuses checkout; "focus on the menu and the cart" both', () => {
    expect(pivotFrom('Stay on checkout', pages)).toEqual({ focus: ['/checkout'] });
    expect(pivotFrom('Focus on the menu, the cart and checkout', pages)).toEqual({
      focus: ['/menu', '/cart', '/checkout'],
    });
  });
  it('a remark that only mentions a page is no pivot; a release lifts it', () => {
    expect(pivotFrom('The checkout button looks off, keep going', pages)).toBeUndefined();
    expect(pivotFrom('Stay on the moon', pages)).toBeUndefined();
    expect(pivotFrom('OK, you can test anywhere now', pages)).toEqual({ lift: true });
  });
});

describe('reading a task from the owner’s words (Allen, Nov 4)', () => {
  it('an instruction to act on the site is a task; feedback and questions aren’t', () => {
    for (const yes of [
      "Fill in name, phone and a pickup time and place the order. It's a demo site, no real money.",
      'Can you add a margherita to the cart and check out?',
      'go ahead and place the order',
      'Okay, place a test order',
      'please submit the form',
      'Order a margherita for pickup',
      'Fitts, book a table for two tonight',
    ])
      expect(taskFrom(yes), yes).toBe(yes);
    for (const no of [
      'add a skip link',
      'make the button bigger',
      "why can't I place an order?",
      'the checkout button looks off, keep going',
      'Stay on checkout',
      'place the cart icon somewhere obvious',
      'That is not a problem',
    ])
      expect(taskFrom(no), no).toBeUndefined();
  });
});
