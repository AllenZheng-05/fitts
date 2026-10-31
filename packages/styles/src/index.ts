// Fitts's design library: parts to compose a look from (color, type, shape, layout, decoration,
// motion, density), and the spec a redesign is built to. The library informs Fitts's choices;
// the owner's wishes and a direction's own changes can override any of it, but never the
// quality bar.
import { palette } from './color';
import { COLORS } from './parts/color';
import { DECORS } from './parts/decor';
import { LAYOUTS } from './parts/layout';
import { DENSITIES, MOTIONS } from './parts/motion';
import { SHAPES } from './parts/shape';
import { TYPES } from './parts/type';
import { fits } from './select';
import type {
  ColorPart,
  DecorPart,
  FontRef,
  Palette,
  Part,
  PartKind,
  Parts,
  TypePart,
} from './types';

export * from './types';
export { contrast, distance, hexOklch, oklchHex, palette, CONTRAST_PAIRS } from './color';
export {
  autoDesigns,
  catalog,
  fits,
  rankParts,
  shortlist,
  targetMood,
  type DesignBrief,
} from './select';

export const PARTS: Part[] = [
  ...COLORS,
  ...TYPES,
  ...SHAPES,
  ...LAYOUTS,
  ...DECORS,
  ...MOTIONS,
  ...DENSITIES,
];

const byId = new Map(PARTS.map((p) => [p.id, p]));

export const part = (id: string): Part | undefined => byId.get(id);
export const partsOf = <K extends PartKind>(kind: K): Extract<Part, { kind: K }>[] =>
  PARTS.filter((p): p is Extract<Part, { kind: K }> => p.kind === kind);

/** A design's parts as a flat list (decoration can be several). */
export const partList = (parts: Parts): Part[] =>
  [parts.color, parts.type, parts.shape, parts.layout, ...parts.decor, parts.motion, parts.density]
    .map((id) => byId.get(id))
    .filter((p): p is Part => p !== undefined);

/** The pairs in a design that don't sit well together, as "a + b" (advice, not a rule). */
export function clashes(parts: Parts): string[] {
  const list = partList(parts);
  const out: string[] = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a && b && a.kind !== b.kind && !fits(a, b)) out.push(`${a.name} + ${b.name}`);
    }
  return out;
}

/** What a direction asks for: its parts and its own changes. */
export interface DesignInput {
  name: string;
  notes: string;
  parts: Parts;
  /** Seed hue 0–360, or the site's brand color to keep as the accent. */
  hue?: number;
  brand?: string;
  /** Fonts the owner named, by family; Fitts fetches them. */
  fonts?: { heading?: string; body?: string };
  /** Where this direction departs from the library, and why (the owner's wishes first). */
  changes?: string[];
}

export interface DesignSpec extends DesignInput {
  palette: Palette;
  fonts: { heading?: string; body?: string };
  type: { heading: FontRef; body: FontRef; accent?: FontRef };
  /** Needs three.js copied into the project. */
  three: boolean;
}

/** A Fontsource id from a family name ("IBM Plex Sans" → "ibm-plex-sans"). */
export const fontId = (family: string) =>
  family
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const named = (family: string, like: FontRef): FontRef =>
  family.trim().toLowerCase() === like.family.toLowerCase()
    ? like
    : { family: family.trim(), id: fontId(family), weights: like.weights, fallback: like.fallback };

/** Fills a direction in: its palette, its fonts (named ones override the pairing's) and 3D. */
export function resolve(input: DesignInput): DesignSpec {
  const color = byId.get(input.parts.color) as ColorPart | undefined;
  const type = byId.get(input.parts.type) as TypePart | undefined;
  if (color?.kind !== 'color' || type?.kind !== 'type')
    throw new Error(`unknown color or type part (${input.parts.color}, ${input.parts.type})`);
  const fonts = input.fonts ?? {};
  return {
    ...input,
    fonts,
    palette: palette(color, {
      ...(input.hue !== undefined ? { hue: input.hue } : {}),
      ...(input.brand ? { brand: input.brand } : {}),
    }),
    type: {
      heading: fonts.heading ? named(fonts.heading, type.heading) : type.heading,
      body: fonts.body ? named(fonts.body, type.body) : type.body,
      ...(type.accent ? { accent: type.accent } : {}),
    },
    three: input.parts.decor.some((id) => (byId.get(id) as DecorPart | undefined)?.three === true),
  };
}

/** Every font file a spec needs: family, Fontsource id and weights, deduped. */
export function specFonts(spec: DesignSpec): FontRef[] {
  const out = new Map<string, FontRef>();
  for (const f of [spec.type.heading, spec.type.body, spec.type.accent]) {
    if (!f) continue;
    const had = out.get(f.id);
    out.set(f.id, had ? { ...had, weights: [...new Set([...had.weights, ...f.weights])] } : f);
  }
  return [...out.values()];
}

const list = (items: string[]) => items.map((s) => `- ${s}`).join('\n');

/** The variables a redesign defines, with this spec's values. */
export function cssVariables(spec: DesignSpec): string {
  const p = spec.palette;
  const font = (f: FontRef) => `"${f.family}", ${f.fallback}`;
  return [
    `--bg: ${p.bg};`,
    `--surface: ${p.surface};`,
    `--text: ${p.text};`,
    `--muted: ${p.muted};`,
    `--border: ${p.border};`,
    `--accent: ${p.accent};`,
    `--on-accent: ${p.onAccent};`,
    `--accent2: ${p.accent2};`,
    `--font-heading: ${font(spec.type.heading)};`,
    `--font-body: ${font(spec.type.body)};`,
    ...(spec.type.accent ? [`--font-accent: ${font(spec.type.accent)};`] : []),
  ].join('\n');
}

/**
 * The spec as the redesigner reads it: the direction's own changes (which win), the palette and
 * fonts, and every part's rules and reference CSS.
 */
export function specMarkdown(
  spec: DesignSpec,
  assets: { fontsCss?: string; three?: string } = {},
): string {
  const sections = partList(spec.parts).map((p) => {
    const extra: string[] = [];
    if (p.kind === 'type')
      extra.push(
        `Scale: ${p.scale.join(', ')}px · line-height ${p.lineHeight.heading} headings, ${p.lineHeight.body} body · heading tracking ${p.tracking}em · heading case: ${p.case}`,
      );
    if (p.kind === 'shape')
      extra.push(
        `Radius ${p.radius.control} controls, ${p.radius.card} cards · border ${p.border} · shadow ${p.shadow}`,
        `Buttons: ${p.components.button}`,
        `Cards: ${p.components.card}`,
        `Inputs: ${p.components.input}`,
        `Navigation: ${p.components.nav}`,
        `Reference CSS: \`${p.css}\``,
      );
    if (p.kind === 'layout') extra.push(`Max width ${p.width}px`, ...p.composition);
    if (p.kind === 'decor' && p.css) extra.push(`Reference CSS: \`${p.css}\``);
    if (p.kind === 'motion')
      extra.push(`Durations ${p.duration[0]}–${p.duration[1]}ms, easing ${p.easing}`);
    if (p.kind === 'density')
      extra.push(
        `Spacing scale ${p.space.join(', ')}px · section gap ${p.section[0]}px desktop, ${p.section[1]}px phone`,
      );
    return [
      `### ${p.kind}: ${p.name}`,
      p.description,
      list([...extra, ...p.rules, ...p.never.map((n) => `Never: ${n}`)]),
    ].join('\n');
  });
  return [
    `## Direction: ${spec.name}`,
    spec.notes,
    ...(spec.changes?.length
      ? ['', '### This direction’s own changes (these win over the library)', list(spec.changes)]
      : []),
    '',
    '### Palette (contrast already checked; use these exact values as CSS variables)',
    '```css',
    cssVariables(spec),
    '```',
    '',
    '### Fonts',
    list([
      `Heading: ${spec.type.heading.family} (${spec.type.heading.weights.join(', ')})`,
      `Body: ${spec.type.body.family} (${spec.type.body.weights.join(', ')})`,
      ...(spec.type.accent
        ? [`Accent: ${spec.type.accent.family} (${spec.type.accent.weights.join(', ')})`]
        : []),
      assets.fontsCss
        ? `The font files are already in the project. Load them with a <link rel="stylesheet" href="${assets.fontsCss}"> in the document head (not a CSS @import: bundlers resolve those as source). Never load fonts from a CDN.`
        : 'If a font can’t be loaded, use its fallback stack.',
    ]),
    ...(spec.three && assets.three
      ? [
          '',
          '### three.js',
          assets.three.startsWith('/')
            ? `three.js is already in the site at ${assets.three}. Load it from a small module of its own with a dynamic import inside a try block: \`const THREE = await import('${assets.three}')\`. Never add a three dependency or a CDN script.`
            : `three.js is already in the project at ${assets.three}. Import it from a small module of its own by a relative path to that file (for example \`const THREE = await import('../fitts/three/three.module.min.js')\` from a module in src/components/), inside a try block so the page still works without it. Never import it by a URL starting with /, from public/, from a CDN, or as a "three" dependency.`,
        ]
      : []),
    '',
    ...sections,
  ].join('\n');
}
