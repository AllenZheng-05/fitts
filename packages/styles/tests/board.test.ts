import { describe, expect, it } from 'vitest';
import {
  buildBoard,
  contrast,
  CONTRAST_PAIRS,
  FONT_SLOT,
  partsOf,
  resolve,
  type Parts,
} from '../src/index';

const words = {
  site: 'Open Team Sheets',
  heading: 'Every team, one sheet',
  button: 'Build a team',
  field: 'Search players',
  nav: ['Tournaments', 'Builder', 'About'],
};

const base = (color: string, type: string): Parts => ({
  color,
  type,
  shape: partsOf('shape')[0]?.id ?? '',
  layout: partsOf('layout')[0]?.id ?? '',
  decor: [partsOf('decor')[0]?.id ?? ''],
  motion: partsOf('motion')[0]?.id ?? '',
  density: partsOf('density')[0]?.id ?? '',
});

const SECTIONS = [
  't-hero',
  't-color',
  't-type',
  't-nav',
  't-buttons',
  't-forms',
  't-cards',
  't-feedback',
  't-icons',
];

describe('style boards (SPEC-phase3 §2.1)', () => {
  it('every color scheme with three type pairings builds a complete board that passes contrast', () => {
    const types = partsOf('type').slice(0, 3);
    let built = 0;
    for (const color of partsOf('color')) {
      for (const type of types) {
        const spec = resolve({ name: 'Test', notes: 'A test.', parts: base(color.id, type.id) });
        const html = buildBoard(spec, words);
        for (const id of SECTIONS) expect(html).toContain(`id="${id}"`);
        // Every text pair on the board meets its ratio (the palette promises it; check anyway).
        for (const [a, b, min] of CONTRAST_PAIRS)
          expect(contrast(spec.palette[a], spec.palette[b])).toBeGreaterThanOrEqual(min - 0.05);
        built += 1;
      }
    }
    expect(built).toBe(partsOf('color').length * 3);
  });

  it('loads nothing from the network and runs no script', () => {
    for (const decor of partsOf('decor')) {
      const parts = {
        ...base(partsOf('color')[0]?.id ?? '', partsOf('type')[0]?.id ?? ''),
        decor: [decor.id],
      };
      const html = buildBoard(resolve({ name: 'T', notes: 'n', parts }), words);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/@import/i);
      expect(html).not.toMatch(/(src|href)="https?:/i);
      expect(html).not.toMatch(/url\(\s*["']?https?:/i);
    }
  });

  it('uses the owner’s words, escaped, and leaves a slot for the fonts', () => {
    const spec = resolve({
      name: 'Test',
      notes: 'n',
      parts: base(partsOf('color')[0]?.id ?? '', partsOf('type')[0]?.id ?? ''),
    });
    const html = buildBoard(spec, { ...words, heading: '<b>Teams & sheets</b>' });
    expect(html).toContain('Open Team Sheets');
    expect(html).toContain('Build a team');
    expect(html).toContain('Search players');
    expect(html).toContain('&lt;b&gt;Teams &amp; sheets&lt;/b&gt;');
    expect(html).not.toContain('<b>Teams');
    expect(html).toContain(FONT_SLOT);
  });

  it('shows the hero picture when there is one, and a gradient when there isn’t', () => {
    const spec = resolve({
      name: 'Test',
      notes: 'n',
      parts: base(partsOf('color')[0]?.id ?? '', partsOf('type')[0]?.id ?? ''),
    });
    expect(buildBoard(spec, words, { hero: 'data:image/png;base64,AAAA' })).toContain(
      'src="data:image/png;base64,AAAA"',
    );
    expect(buildBoard(spec, words)).toContain('class="art"');
  });
});
