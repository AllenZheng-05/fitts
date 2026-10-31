// Narrowing the library for one brief: parts ranked by kind, the catalog the model composes
// directions from, and three varied designs built by code when the model can't compose any.
import { COLORS } from './parts/color';
import { DECORS } from './parts/decor';
import { LAYOUTS } from './parts/layout';
import { DENSITIES, MOTIONS } from './parts/motion';
import { SHAPES } from './parts/shape';
import { TYPES } from './parts/type';
import { PART_KINDS, type Part, type PartKind, type Parts } from './types';

const ALL_PARTS: Part[] = [
  ...COLORS,
  ...TYPES,
  ...SHAPES,
  ...LAYOUTS,
  ...DECORS,
  ...MOTIONS,
  ...DENSITIES,
];

/** The brief fields that steer a look. */
export interface DesignBrief {
  for?: string;
  who?: string;
  feel?: string;
  look?: string;
  keep?: string;
  avoid?: string;
  inspiration?: string;
  boldness?: string;
}

/** Words that move the target mood: [energy, formality]. */
const MOOD: [RegExp, number, number][] = [
  [/\b(calm|quiet|serene|peaceful|gentle|soft|minimal|subtle|relax)/, -1, 0],
  [/\b(fun|playful|whimsical|silly|joy|cheerful|cute|quirky|kids?|children)/, 1, -2],
  [/\b(bold|loud|striking|energetic|vibrant|wild|punchy|dramatic)/, 2, 0],
  [/\b(professional|serious|trust|credible|formal|corporate|official|authoritative)/, -1, 2],
  [/\b(luxur|elegant|premium|refined|sophisticat|classy|upscale)/, -1, 2],
  [/\b(friendly|warm|approachable|welcoming|cozy)/, 0, -1],
  [/\b(edgy|raw|rebellious|punk|grunge|underground)/, 1, -2],
  [/\b(older|seniors?|grandparents|low vision|accessib)/, -1, 1],
];

const clamp = (n: number) => Math.min(5, Math.max(1, n));

/** The target mood from the brief: start in the middle, moved by its words. */
export function targetMood(brief: DesignBrief): [number, number] {
  const text = [brief.for, brief.who, brief.feel, brief.look].filter(Boolean).join(' ');
  let e = 3;
  let f = 3;
  for (const [re, de, df] of MOOD)
    if (re.test(text.toLowerCase())) {
      e += de;
      f += df;
    }
  return [clamp(e), clamp(f)];
}

const briefText = (b: DesignBrief) =>
  [b.for, b.who, b.feel, b.look, b.inspiration].filter(Boolean).join(' ').toLowerCase();

/**
 * How well a part suits a brief: its words in the brief (the owner's own look words count most),
 * its mood, and the owner's dislikes.
 */
function scorePart(
  p: Part,
  text: string,
  look: string,
  avoid: string,
  mood: [number, number],
): number {
  let score = 0;
  for (const k of p.keywords) if (text.includes(k)) score += look.includes(k) ? 5 : 2;
  if (text.includes(p.name.toLowerCase())) score += 6;
  if (avoid.includes(p.name.toLowerCase())) score -= 12;
  for (const k of p.keywords) if (k.length > 3 && avoid.includes(k)) score -= 4;
  // Density and motion follow the brief's mood less strictly than the look itself.
  const weight = p.kind === 'density' ? 0.5 : 1.2;
  score -= (Math.abs(p.energy - mood[0]) + Math.abs(p.formality - mood[1])) * weight;
  return score;
}

/** Every kind's parts, best for the brief first. */
export function rankParts(
  brief: DesignBrief,
  mood: [number, number] = targetMood(brief),
): Record<PartKind, Part[]> {
  const text = briefText(brief);
  const look = [brief.look, brief.inspiration].filter(Boolean).join(' ').toLowerCase();
  const avoid = (brief.avoid ?? '').toLowerCase();
  const out = {} as Record<PartKind, Part[]>;
  for (const kind of PART_KINDS)
    out[kind] = ALL_PARTS.filter((p) => p.kind === kind)
      .map((p) => ({ p, s: scorePart(p, text, look, avoid, mood) }))
      .sort((a, b) => b.s - a.s)
      .map(({ p }) => p);
  return out;
}

/** The top few parts of each kind for a brief, for the model's shortlist. */
export function shortlist(brief: DesignBrief, n = 5): Record<PartKind, Part[]> {
  const ranked = rankParts(brief);
  return Object.fromEntries(
    PART_KINDS.map((k) => [k, ranked[k].slice(0, k === 'density' ? 3 : n)]),
  ) as Record<PartKind, Part[]>;
}

const ERA_ORDER = ['classical', 'vintage', 'retro', 'modern', 'futuristic'];

/** Close in energy and formality, from neighboring eras ("timeless" goes with anything). */
export function fits(a: Part, b: Part): boolean {
  if (a.clashes?.includes(b.id) || b.clashes?.includes(a.id)) return false;
  if (a.kind === 'density' || b.kind === 'density') return true;
  if (Math.abs(a.energy - b.energy) > 2 || Math.abs(a.formality - b.formality) > 2) return false;
  if (a.eras.includes('timeless') || b.eras.includes('timeless')) return true;
  return a.eras.some((x) =>
    b.eras.some((y) => Math.abs(ERA_ORDER.indexOf(x) - ERA_ORDER.indexOf(y)) <= 2),
  );
}

/**
 * Three varied designs straight from the ranked parts: the closest fit, one pushed bolder, and
 * one from a different corner of the library. Each part is the best one that goes with the parts
 * already chosen, and the second and third avoid the earlier designs' color, type and shape.
 */
export function autoDesigns(brief: DesignBrief): Parts[] {
  const [e, f] = targetMood(brief);
  const moods: [number, number][] = [
    [e, f],
    [clamp(e + 1), f],
    [e, clamp(f > 3 ? f - 2 : f + 2)],
  ];
  const used = new Map<PartKind, Set<string>>();
  return moods.map((mood, i) => {
    const ranked = rankParts(brief, mood);
    const chosen: Part[] = [];
    const take = (kind: PartKind): Part => {
      const fresh = i > 0 && ['color', 'type', 'shape', 'layout'].includes(kind);
      const options = ranked[kind].filter((p) => !fresh || !used.get(kind)?.has(p.id));
      const p =
        options.find((x) => chosen.every((c) => fits(x, c))) ?? options[0] ?? ranked[kind][0]!;
      chosen.push(p);
      used.set(kind, new Set([...(used.get(kind) ?? []), p.id]));
      return p;
    };
    const parts: Parts = {
      color: take('color').id,
      type: take('type').id,
      shape: take('shape').id,
      layout: take('layout').id,
      motion: take('motion').id,
      density: take('density').id,
      decor: [],
    };
    // Decoration only when it suits as well as the rest; 3D only for a lively brief.
    const decor = ranked.decor.find(
      (d) => chosen.every((c) => fits(d, c)) && (!('three' in d && d.three) || mood[0] >= 4),
    );
    if (decor) parts.decor = [decor.id];
    return parts;
  });
}

const mood = (p: Part) => `e${p.energy} f${p.formality} ${p.eras.join('/')}`;

/** The whole library, one line per part, for the model to compose from. */
export function catalog(): string {
  const lines: string[] = [];
  for (const kind of PART_KINDS) {
    lines.push(`## ${kind}`);
    for (const p of ALL_PARTS.filter((x) => x.kind === kind)) {
      const extra =
        p.kind === 'type'
          ? ` [${p.heading.family} / ${p.body.family}]`
          : p.kind === 'color'
            ? ` [${p.mode}${p.rehue ? ', any hue' : ''}]`
            : p.kind === 'decor' && p.three
              ? ' [three.js]'
              : '';
      lines.push(`- ${p.id}: ${p.name}${extra} (${mood(p)}). ${p.description}`);
    }
  }
  return lines.join('\n');
}
