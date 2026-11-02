// @vitest-environment node
// The device matrix (SPEC-phase4 §6.3): breakpoint pairs, the cap, dedupe and media gating.
import { describe, expect, it } from 'vitest';
import {
  MAX_CELLS,
  cellWords,
  chooseCells,
  dedupe,
  mergeBreakpoints,
  widthsFromCss,
} from '../../src/agent/devices/matrix';

describe('chooseCells', () => {
  it('always has the reflow, phone, landscape, laptop, desktop, 200% and text-spacing cells', () => {
    const ids = chooseCells({ breakpoints: [] }).map((c) => c.id);
    expect(ids).toEqual([
      'reflow-320',
      'phone',
      'phone-landscape',
      'laptop',
      'desktop',
      'zoom-200',
      'text-spacing',
    ]);
  });

  it('adds dark and reduced-motion cells only when the site has those rules', () => {
    expect(chooseCells({ breakpoints: [] }).some((c) => c.scheme === 'dark')).toBe(false);
    const cells = chooseCells({ breakpoints: [], dark: true, reducedMotion: true });
    expect(cells.find((c) => c.id === 'dark')?.scheme).toBe('dark');
    expect(cells.find((c) => c.id === 'reduced-motion')?.motion).toBe('reduce');
  });

  it('gives each breakpoint a cell just under it and one at it, most-used first', () => {
    const cells = chooseCells({
      breakpoints: [
        { width: 768, uses: 3 },
        { width: 1024, uses: 1 },
      ],
    });
    const widths = cells.map((c) => c.width);
    expect(widths).toContain(767);
    expect(widths).toContain(768);
    expect(widths).toContain(1023);
    expect(widths).toContain(1024);
    expect(widths.indexOf(767)).toBeLessThan(widths.indexOf(1023));
    // A phone-sized width is mobile and touch; a wider one a desktop browser.
    expect(cells.find((c) => c.width === 767)).toMatchObject({ mobile: false, touch: false });
    expect(
      chooseCells({ breakpoints: [{ width: 480, uses: 1 }] }).find((c) => c.width === 479),
    ).toMatchObject({ mobile: true, touch: true });
  });

  it('caps at ten cells: the 1440 desktop and landscape go first, then the least-used breakpoints', () => {
    const cells = chooseCells({
      breakpoints: [
        { width: 480, uses: 5 },
        { width: 640, uses: 4 },
        { width: 768, uses: 3 },
        { width: 1024, uses: 2 },
        { width: 1200, uses: 1 },
      ],
      dark: true,
      reducedMotion: true,
    });
    expect(cells.length).toBeLessThanOrEqual(MAX_CELLS);
    const widths = cells.map((c) => c.width);
    // The fifth breakpoint never made it (≤ 4), and the least-used of the four went first.
    expect(widths).not.toContain(1199);
    expect(widths).not.toContain(1023);
    expect(widths).toContain(479);
    expect(cells.some((c) => c.id === 'reflow-320')).toBe(true);
    expect(cells.some((c) => c.id === 'phone')).toBe(true);
    expect(cells.some((c) => c.id === 'desktop')).toBe(false);
    expect(cells.some((c) => c.id === 'phone-landscape')).toBe(false);
  });

  it('dedupes plain widths within 8px but keeps the special cells at the same width', () => {
    const cells = chooseCells({ breakpoints: [{ width: 1280, uses: 2 }] });
    const at1280 = cells.filter((c) => c.width === 1280 || c.width === 1279);
    // The pair (1279 and 1280) stays whole and the fixed laptop at 1280 goes; zoom and
    // spacing stay because they test something else.
    expect(at1280.map((c) => c.id)).toEqual(['w1279', 'w1280', 'zoom-200', 'text-spacing']);
    expect(cells.some((c) => c.id === 'laptop')).toBe(false);
    expect(
      dedupe([
        { id: 'a', label: '', width: 390, height: 800, mobile: true, touch: true },
        { id: 'b', label: '', width: 395, height: 800, mobile: true, touch: true },
        { id: 'c', label: '', width: 400, height: 800, mobile: true, touch: true },
      ]).map((c) => c.id),
    ).toEqual(['a', 'c']);
  });

  it('ignores breakpoints that are not screens', () => {
    const cells = chooseCells({
      breakpoints: [
        { width: 0, uses: 9 },
        { width: 10_000, uses: 9 },
      ],
    });
    expect(cells.map((c) => c.width)).not.toContain(0);
    expect(cells.map((c) => c.width)).not.toContain(9999);
  });
});

describe('widthsFromCss and mergeBreakpoints', () => {
  it('reads min/max-width, range syntax and em units, counting uses', () => {
    const css = `
      @media (max-width: 768px) { a { color: red } }
      @media (min-width: 768px) and (max-width: 1023px) { b { color: red } }
      @media (width >= 48em) { c { color: red } }
      @container (min-width: 20rem) { d { color: red } }
    `;
    expect(widthsFromCss(css)).toEqual([
      { width: 320, uses: 1 },
      { width: 768, uses: 3 },
      { width: 1023, uses: 1 },
    ]);
  });

  it('merges the model’s breakpoints into the detected ones within 8px', () => {
    expect(mergeBreakpoints([{ width: 768, uses: 2 }], [770, 1024])).toEqual([
      { width: 768, uses: 3 },
      { width: 1024, uses: 1 },
    ]);
  });
});

describe('cellWords', () => {
  it('says size, pointer, scheme, zoom and what else the cell emulates', () => {
    expect(
      cellWords({ id: 'x', label: '', width: 390, height: 844, mobile: true, touch: true }),
    ).toBe('390×844 · touch · light · 100%');
    expect(
      cellWords({
        id: 'x',
        label: '',
        width: 1280,
        height: 800,
        mobile: false,
        touch: false,
        zoom: 2,
        textSpacing: true,
        motion: 'reduce',
      }),
    ).toBe('1280×800 · mouse · light · 200% · text spacing · reduced motion');
  });
});
