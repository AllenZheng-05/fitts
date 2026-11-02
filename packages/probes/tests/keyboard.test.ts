// Keyboard analysis (SPEC-phase4 §6B.2) on recorded Tab sequences.
import { describe, expect, it } from 'vitest';
import { dialogProblems, keyboardKind, keyboardProblems, type TabStop } from '../src/keyboard';

const stop = (ref: string, y: number, visible = 1): TabStop => ({
  ref,
  selector: `#${ref}`,
  name: ref,
  rect: { x: 10, y, width: 80, height: 30 },
  visible,
});
const el = (ref: string) => ({ ref, selector: `#${ref}`, name: ref });

describe('keyboardProblems', () => {
  it('a clean sweep in reading order has no problems', () => {
    const r = keyboardProblems({
      stops: [stop('a', 10), stop('b', 60), stop('c', 110)],
      interactive: [el('a'), el('b'), el('c')],
      navLinks: 2,
      skipLink: false,
    });
    expect(r).toEqual({ items: [], orderJumps: 0 });
  });

  it('flags a control Tab never reaches', () => {
    const r = keyboardProblems({
      stops: [stop('a', 10), stop('b', 60)],
      interactive: [el('a'), el('b'), el('div-button')],
      navLinks: 0,
      skipLink: false,
    });
    expect(r.items.map((i) => [i.ref, keyboardKind(i.measured)])).toEqual([
      ['div-button', 'unreachable'],
    ]);
  });

  it('focus stuck on one element is a trap, reported once, and hides the unreached list', () => {
    const r = keyboardProblems({
      stops: [
        stop('a', 10),
        stop('trap', 60),
        stop('trap', 60),
        stop('trap', 60),
        stop('trap', 60),
      ],
      interactive: [el('a'), el('trap'), el('b'), el('c')],
      navLinks: 0,
      skipLink: false,
    });
    expect(r.items).toHaveLength(1);
    expect(keyboardKind(r.items[0]?.measured ?? '')).toBe('stuck');
  });

  it('a focused control under a sticky header (under half visible) is hidden', () => {
    const r = keyboardProblems({
      stops: [stop('a', 10), stop('under-header', 5, 0.2), stop('under-header', 5, 0.2)],
      interactive: [el('a'), el('under-header')],
      navLinks: 0,
      skipLink: false,
    });
    expect(r.items.map((i) => keyboardKind(i.measured))).toEqual(['hidden']);
    expect(r.items[0]?.measured).toContain('20% visible');
  });

  it('counts jumps back up the page; a long nav without a skip link is flagged', () => {
    const r = keyboardProblems({
      stops: [
        stop('a', 300),
        stop('b', 10),
        stop('c', 400),
        stop('d', 20),
        stop('e', 500),
        stop('f', 30),
      ],
      interactive: ['a', 'b', 'c', 'd', 'e', 'f'].map(el),
      navLinks: 8,
      skipLink: false,
    });
    expect(r.orderJumps).toBe(3);
    expect(r.items.map((i) => keyboardKind(i.measured))).toEqual(['skip-link']);
    expect(
      keyboardProblems({ stops: [], interactive: [], navLinks: 8, skipLink: true }).items,
    ).toEqual([]);
  });
});

describe('dialogProblems', () => {
  it('each broken dialog rule is its own item', () => {
    const items = dialogProblems({
      ref: 'rate',
      selector: '#rate',
      name: 'Rate us',
      focusMovedIn: false,
      tabStaysIn: false,
      escCloses: false,
      focusReturned: true,
    });
    expect(items.map((i) => i.measured)).toEqual([
      'focus stayed behind the "Rate us" dialog when it opened',
      'Tab leaves the "Rate us" dialog while it\'s open',
      'Esc doesn\'t close the "Rate us" dialog',
    ]);
    expect(items.every((i) => keyboardKind(i.measured) === 'dialog')).toBe(true);
  });
});
