import { describe, expect, it } from 'vitest';
import {
  autoDesigns,
  catalog,
  clashes,
  contrast,
  CONTRAST_PAIRS,
  part,
  partsOf,
  palette,
  PARTS,
  resolve,
  shortlist,
  specFonts,
  specMarkdown,
  type Parts,
} from '../src/index';

describe('the parts', () => {
  it('have unique ids', () => {
    const ids = PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cover every kind with real choice', () => {
    expect(partsOf('color').length).toBeGreaterThanOrEqual(20);
    expect(partsOf('type').length).toBeGreaterThanOrEqual(28);
    expect(partsOf('shape').length).toBeGreaterThanOrEqual(12);
    expect(partsOf('layout').length).toBeGreaterThanOrEqual(12);
    expect(partsOf('decor').length).toBeGreaterThanOrEqual(14);
    expect(partsOf('decor').filter((d) => d.three)).toHaveLength(2);
  });

  it('give every color scheme passing contrast, in its own hue and re-hued', () => {
    for (const scheme of partsOf('color')) {
      const hues = scheme.rehue ? [undefined, 0, 60, 120, 180, 240, 300] : [undefined];
      for (const hue of hues) {
        const p = palette(scheme, hue === undefined ? {} : { hue });
        for (const [fg, bg, min] of CONTRAST_PAIRS)
          expect(
            contrast(p[fg], p[bg]),
            `${scheme.id} hue ${hue}: ${fg} on ${bg}`,
          ).toBeGreaterThanOrEqual(min - 0.01);
      }
    }
  });

  it('keep a brand color when it reaches contrast, and fix it when it does not', () => {
    const trust = partsOf('color').find((c) => c.id === 'trust-blue')!;
    expect(palette(trust, { brand: '#0b5fff' }).accent).toBe('#0b5fff');
    const pale = palette(trust, { brand: '#ffe066' });
    expect(contrast(pale.accent, pale.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(pale.onAccent, pale.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('use one type scale of at most six sizes, and no default system faces', () => {
    for (const t of partsOf('type')) {
      expect(t.scale.length).toBeLessThanOrEqual(6);
      expect([...t.scale].sort((a, b) => a - b)).toEqual(t.scale);
      for (const f of [t.heading, t.body, t.accent].filter(Boolean))
        expect(f!.family).not.toMatch(/^(Inter|Roboto|Arial|Helvetica|Open Sans)$/);
      for (const f of [t.heading, t.body, t.accent].filter(Boolean))
        expect(f!.id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('picking', () => {
  const ids = (b: Parameters<typeof shortlist>[0]) => {
    const s = shortlist(b);
    return [...s.color, ...s.type, ...s.shape, ...s.layout, ...s.decor].map((p) => p.id);
  };

  it('shortlists trustworthy parts for a bank, never candy or kawaii', () => {
    const top = shortlist({
      for: 'Online banking for a credit union',
      who: 'Members',
      feel: 'Trustworthy and calm',
    });
    expect(top.color.slice(0, 2).map((p) => p.id)).toContain('trust-blue');
    expect(top.type.slice(0, 3).map((p) => p.id)).toContain('corporate');
    expect(ids({ for: 'Online banking', feel: 'Trustworthy' })).not.toContain('candy-pop');
    expect(ids({ for: 'Online banking', feel: 'Trustworthy' })).not.toContain('kawaii');
  });

  it('shortlists playful parts for a kids site, never the luxury ones', () => {
    const top = shortlist({
      for: 'A summer camp for kids',
      who: 'Parents and children',
      feel: 'Fun and cheerful',
    });
    expect(
      top.type.slice(0, 3).some((p) => ['rounded-fun', 'kawaii', 'pixel'].includes(p.id)),
    ).toBe(true);
    expect(top.shape.slice(0, 3).map((p) => p.id)).toContain('chunky');
    expect(ids({ for: 'A summer camp for kids', feel: 'Fun' })).not.toContain('luxury');
  });

  it('ranks a part the owner names first, and sinks one they rule out', () => {
    expect(shortlist({ for: 'Portfolio', look: 'synthwave, neon at night' }).color[0]?.id).toBe(
      'neon-dusk',
    );
    expect(
      shortlist({ for: 'Portfolio', look: 'bold', avoid: 'hard shadow, nothing brutal' }).shape.map(
        (p) => p.id,
      ),
    ).not.toContain('hard-shadow');
  });

  it('builds three varied, coherent designs when the model can’t', () => {
    for (const brief of [
      { for: 'Online banking', feel: 'Trustworthy and calm' },
      { for: 'A summer camp for kids', feel: 'Fun and cheerful' },
      { for: 'A developer tool' },
      { for: 'Portfolio', look: '3D, playful, a toy shop feel' },
    ]) {
      const designs = autoDesigns(brief);
      expect(designs).toHaveLength(3);
      for (const d of designs) {
        for (const k of ['color', 'type', 'shape', 'layout', 'motion', 'density'] as const)
          expect(part(d[k])?.kind).toBe(k);
      }
      expect(clashes(designs[0]!), brief.for).toEqual([]);
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++) {
          const differ = (['color', 'type', 'shape', 'layout'] as const).filter(
            (k) => designs[i]![k] !== designs[j]![k],
          );
          expect(differ.length, `${brief.for} ${i} vs ${j}`).toBeGreaterThanOrEqual(2);
        }
    }
  });

  it('keeps 3D for lively briefs', () => {
    const calm = autoDesigns({ for: 'A clinic', feel: 'Calm and professional' });
    for (const d of calm) expect(d.decor.some((id) => id.startsWith('three'))).toBe(false);
  });

  it('describes the whole library for the model', () => {
    const text = catalog();
    for (const p of PARTS) expect(text).toContain(`- ${p.id}:`);
  });
});

describe('a resolved spec', () => {
  const parts: Parts = {
    color: 'vivid-3d',
    type: 'playful-wide',
    shape: 'pill',
    layout: 'immersive',
    decor: ['three-object'],
    motion: 'bouncy',
    density: 'regular',
  };

  it('takes the owner’s fonts over the pairing, and knows it needs three.js', () => {
    const spec = resolve({
      name: 'Toybox',
      notes: 'n',
      parts,
      fonts: { heading: 'Rubik Mono One' },
    });
    expect(spec.type.heading).toMatchObject({ family: 'Rubik Mono One', id: 'rubik-mono-one' });
    expect(spec.type.body.family).toBe('Outfit');
    expect(spec.three).toBe(true);
    expect(specFonts(spec).map((f) => f.id)).toEqual(['rubik-mono-one', 'outfit']);
  });

  it('writes the palette, the rules, its changes and the nearest worked example', () => {
    const spec = resolve({
      name: 'Toybox',
      notes: 'Playful 3D.',
      parts,
      brand: '#c2410c',
      changes: ['Keep the existing orange as the accent (the owner asked).'],
    });
    const md = specMarkdown(spec, {
      fontsCss: '/fitts/fonts.css',
      three: '/fitts/three/three.module.js',
    });
    expect(md).toContain('--accent: #c2410c;');
    expect(md).toContain('Keep the existing orange');
    expect(md).toContain("import(/* @vite-ignore */ '/fitts/three/three.module.js')");
    expect(md).toContain('### decor: 3D hero object');
    expect(md).toContain('/fitts/fonts.css');
  });
});
