// The surprise detector's analysis (SPEC-phase4 §6B.5) on recorded event logs.
import { describe, expect, it } from 'vitest';
import {
  movedBeforeTap,
  movedOnPage,
  surpriseKind,
  surpriseProblems,
  type SurpriseEvent,
} from '../src/surprise';

describe('surpriseProblems', () => {
  it('a dialog 4 s after loading with no input popped up; one right after a tap did not', () => {
    const dialog = (at: number): SurpriseEvent => ({
      type: 'added',
      at,
      ref: 'rate',
      selector: '#rate',
      name: 'Rate us',
      role: 'dialog',
      fixed: true,
      zIndex: 1000,
      coverage: 0.4,
    });
    const r = surpriseProblems([dialog(4000)], [], 0);
    expect(r.notes).toEqual([
      {
        kind: 'popped-up',
        ref: 'rate',
        at: 4000,
        measured:
          'a dialog ("Rate us") popped up 4.0 s after the page loaded without anything prompting it',
      },
    ]);
    expect(surpriseProblems([dialog(4300)], [4000]).notes).toEqual([]);
  });

  it('a dialog 0.6 s after a tap is a note for the judge, without claiming nothing prompted it', () => {
    const added = (role: string): SurpriseEvent => ({
      type: 'added',
      at: 4600,
      ref: 'rate',
      selector: '#rate',
      name: 'Rate us',
      role,
      fixed: true,
      zIndex: 1000,
      coverage: 0.4,
    });
    expect(surpriseProblems([added('dialog')], [4000]).notes).toEqual([
      {
        kind: 'popped-up',
        ref: 'rate',
        at: 4600,
        measured: 'a dialog ("Rate us") popped up 0.6 s after the last tap',
      },
    ]);
    // A plain overlay that soon after a tap is most likely its answer: nothing.
    expect(surpriseProblems([added('')], [4000]).notes).toEqual([]);
  });

  it('a layout shift with no recent input jumped; with input it did not', () => {
    const shift = (hadRecentInput: boolean): SurpriseEvent => ({
      type: 'shift',
      at: 2100,
      hadRecentInput,
      sources: [{ ref: 'send', selector: '#send', name: 'Send', fromY: 400, toY: 580 }],
    });
    expect(surpriseProblems([shift(false)], [], 0).notes[0]?.measured).toBe(
      '"Send" jumped 180 px down 2.1 s after the page loaded, with no tap',
    );
    expect(surpriseProblems([shift(true)], []).notes).toEqual([]);
  });

  it('focus moving on its own is a note; focus alone opening a page is WCAG 3.2.1', () => {
    const r = surpriseProblems(
      [
        { type: 'focus', at: 5000, ref: 'q', selector: '#q', name: 'Search' },
        { type: 'focus', at: 9000, ref: 'm', selector: '#m', name: 'Menu', caused: 'nav' },
      ],
      [1000],
    );
    expect(r.notes.map((n) => n.kind)).toEqual(['focus-moved']);
    expect(r.items.map((i) => surpriseKind(i.measured))).toEqual(['focus']);
  });

  it('typing that changes the page, a vanishing toast and autoplaying sound are findings', () => {
    const r = surpriseProblems(
      [
        {
          type: 'typed-change',
          at: 100,
          ref: 'c',
          selector: '#c',
          name: 'Country',
          what: 'opened another page',
        },
        {
          type: 'removed',
          at: 200,
          ref: 't',
          selector: '.toast',
          words: 12,
          shownMs: 3000,
          text: 'Your message was sent to Grandma and will arrive soon',
        },
        {
          type: 'removed',
          at: 300,
          ref: 't2',
          selector: '.toast',
          words: 3,
          shownMs: 1000,
          text: 'Saved',
        },
        { type: 'media', at: 5000, ref: 'v', selector: 'video', muted: false, playingMs: 4000 },
        { type: 'media', at: 6000, ref: 'v2', selector: 'video', muted: true, playingMs: 9000 },
      ],
      [],
    );
    expect(r.items.map((i) => surpriseKind(i.measured))).toEqual([
      'typing',
      'vanished',
      'autoplay',
    ]);
  });

  it('a page that scrolls itself 300 px is a note', () => {
    expect(surpriseProblems([{ type: 'scroll', at: 3000, dy: 300 }], []).notes[0]?.kind).toBe(
      'scrolled-by-itself',
    );
    expect(surpriseProblems([{ type: 'scroll', at: 3000, dy: 120 }], []).notes).toEqual([]);
  });
});

describe('movedBeforeTap', () => {
  it('more than 20 px between deciding and tapping', () => {
    const t = { ref: 'send', selector: '#send', name: 'Send', decided: { x: 100, y: 400 } };
    expect(movedBeforeTap({ ...t, tapped: { x: 100, y: 440 } })?.measured).toBe(
      '"Send" moved 40 px just before the tap',
    );
    expect(movedBeforeTap({ ...t, tapped: { x: 105, y: 410 } })).toBeNull();
  });
});

describe('a move is on the page, not in the view', () => {
  const box = (top: number, scrollY: number) => ({
    left: 600,
    top,
    width: 160,
    height: 44,
    scrollX: 0,
    scrollY,
  });
  it("Fitts's own smooth scroll into view moves the button in the view only: no finding", () => {
    // Basil & Ember, Nov 4: "Order pickup" read at 500, then 379 once the scroll had gone 121 px.
    expect(movedOnPage(box(500, 0), box(379, 121))).toBeUndefined();
  });
  it('a banner that loads late and pushes the button down 121 px is caught', () => {
    const moved = movedOnPage(box(500, 0), box(621, 0));
    expect(moved).toEqual({ decided: { x: 680, y: 522 }, tapped: { x: 680, y: 643 } });
    const t = { ref: 'order', selector: '', name: 'Order pickup' };
    expect(movedBeforeTap({ ...t, ...moved! })?.measured).toBe(
      '"Order pickup" moved 121 px just before the tap',
    );
  });
});

describe("the page's own scrolls, not Fitts's", () => {
  it('a scroll Fitts or a key caused is no note, whenever it lands', () => {
    const own: SurpriseEvent = { type: 'scroll', at: 5000, dy: -549, own: true };
    expect(surpriseProblems([own], [1000]).notes).toEqual([]);
    expect(surpriseProblems([{ ...own, own: undefined }], [1000]).notes[0]?.measured).toBe(
      'the page scrolled 549 px up by itself 4.0 s after the last tap',
    );
  });
});
