// Theme-fit (SPEC-phase2 §8.3): once per run, after the first 3 routes, a model judges whether
// the site's look suits who it's for. When it doesn't, or the owner asked for a new look, a
// second call composes 3 directions from the design library (@fitts/styles), built around the
// owner's wishes and any sites they admire. The library informs the choice; it doesn't limit it.
import type { Brief } from '@fitts/schema';
import {
  autoDesigns,
  catalog,
  part,
  PARTS,
  rankParts,
  resolve,
  shortlist,
  type DesignSpec,
  type Parts,
} from '@fitts/styles';
import prompt from '../../../../../docs/prompts/theme-fit.md?raw';
import directionsPrompt from '../../../../../docs/prompts/directions.md?raw';
import { wantsRedesign } from '../interview/interview';
import type { CallContext, LlmCaller } from '../llm/call';

export type DirectionKind = 'closest' | 'further' | 'unexpected';

export interface Direction {
  id: string;
  name: string;
  swatches: string[];
  typeface: string;
  notes: string;
  kind: DirectionKind;
  /** The full design: parts, palette, fonts and the direction's own changes. */
  spec: DesignSpec;
}

export interface ThemeFit {
  fits: boolean;
  why: string;
  directions: Direction[];
}

/** A site the owner admires, as captured in main. */
export interface Inspiration {
  url: string;
  shots: string[];
  style: string;
}

export const THEME_FIT_FORMAT = {
  type: 'json_schema',
  name: 'theme_fit',
  strict: true,
  schema: {
    type: 'object',
    properties: { fits: { type: 'boolean' }, why: { type: 'string' } },
    required: ['fits', 'why'],
    additionalProperties: false,
  },
};

const str = { type: 'string' };
const KINDS: DirectionKind[] = ['closest', 'further', 'unexpected'];

export const DIRECTIONS_FORMAT = {
  type: 'json_schema',
  name: 'directions',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      directions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: KINDS },
            name: str,
            notes: str,
            color: str,
            type: str,
            shape: str,
            layout: str,
            decor: { type: 'array', items: str },
            motion: str,
            density: str,
            hue: { type: 'number' },
            brand: str,
            headingFont: str,
            bodyFont: str,
            changes: { type: 'array', items: str },
          },
          required: [
            'kind',
            'name',
            'notes',
            'color',
            'type',
            'shape',
            'layout',
            'decor',
            'motion',
            'density',
            'hue',
            'brand',
            'headingFont',
            'bodyFont',
            'changes',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['directions'],
    additionalProperties: false,
  },
};

/** Checks the verdict. */
export function parseThemeFit(text: string): { fits: boolean; why: string } {
  const raw = JSON.parse(text) as Partial<{ fits: unknown; why: unknown }>;
  const why = typeof raw.why === 'string' ? raw.why.trim().slice(0, 400) : '';
  if (!why) throw new Error('unusable theme-fit verdict');
  return { fits: raw.fits === true, why };
}

const HEX = /^#[0-9a-f]{6}$/i;
const asText = (v: unknown) => (typeof v === 'string' ? v : '');
const kindOf = new Map(PARTS.map((p) => [p.id, p.kind]));
const SURFACE_KEYS = ['color', 'type', 'shape', 'layout'] as const;

/** A direction as the pick card shows it, from its resolved spec. */
function direction(id: string, kind: DirectionKind, spec: DesignSpec): Direction {
  const p = spec.palette;
  return {
    id,
    kind,
    name: spec.name,
    swatches: [p.bg, p.text, p.accent, p.accent2],
    typeface: spec.type.heading.family,
    notes: spec.notes,
    spec,
  };
}

/** A direction in words, for its mockup: its shapes, layout, decoration and own changes. */
export function describeDirection(d: Direction): string {
  const name = (id: string) => part(id)?.name.toLowerCase() ?? id;
  const p = d.spec.parts;
  return [
    `Shapes: ${name(p.shape)}. Layout: ${name(p.layout)}.`,
    p.decor.length ? `Decoration: ${p.decor.map(name).join(', ')}.` : 'No decoration.',
    ...(d.spec.changes ?? []).slice(0, 3),
  ].join(' ');
}

/**
 * Checks the composed directions: real part ids of the right kind (an unknown id becomes the
 * brief's best part of that kind), 3 of them, and really different from each other.
 */
export function parseDirections(text: string, brief: Brief = {}): Direction[] {
  const raw = JSON.parse(text) as { directions?: Record<string, unknown>[] };
  const list = Array.isArray(raw.directions) ? raw.directions.slice(0, 3) : [];
  const ranked = rankParts(brief);
  const out = list.map((d, i): Direction => {
    const pick = (k: Exclude<keyof Parts, 'decor'>): string => {
      const id = asText(d[k]);
      return kindOf.get(id) === k ? id : (ranked[k][0]?.id ?? '');
    };
    const decor = (Array.isArray(d['decor']) ? d['decor'] : [])
      .map(asText)
      .filter((id) => kindOf.get(id) === 'decor')
      .slice(0, 2);
    const hue = Number(d['hue']);
    const brand = asText(d['brand']);
    const font = (k: string) => {
      const v = asText(d[k]).trim();
      return v && v.length <= 40 && /^[\w\s.'&-]+$/.test(v) ? v : undefined;
    };
    const headingFont = font('headingFont');
    const bodyFont = font('bodyFont');
    const kind = KINDS.includes(d['kind'] as DirectionKind)
      ? (d['kind'] as DirectionKind)
      : (KINDS[i] ?? 'closest');
    const name = asText(d['name']).trim().slice(0, 40);
    if (!name) throw new Error(`direction ${i + 1} has no name`);
    const spec = resolve({
      name,
      notes: asText(d['notes']).trim().slice(0, 220),
      parts: {
        color: pick('color'),
        type: pick('type'),
        shape: pick('shape'),
        layout: pick('layout'),
        decor,
        motion: pick('motion'),
        density: pick('density'),
      },
      ...(hue >= 0 && hue <= 360 ? { hue } : {}),
      ...(HEX.test(brand) ? { brand } : {}),
      ...(headingFont || bodyFont
        ? {
            fonts: {
              ...(headingFont ? { heading: headingFont } : {}),
              ...(bodyFont ? { body: bodyFont } : {}),
            },
          }
        : {}),
      changes: (Array.isArray(d['changes']) ? d['changes'] : [])
        .map((c) => asText(c).trim().slice(0, 220))
        .filter(Boolean)
        .slice(0, 5),
    });
    return direction(['a', 'b', 'c'][i] ?? String(i), kind, spec);
  });
  if (out.length < 3) throw new Error('fewer than 3 directions');
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i]!.spec.parts;
      const b = out[j]!.spec.parts;
      const differ = SURFACE_KEYS.filter((k) => a[k] !== b[k]).length;
      if (differ < 2) throw new Error(`directions ${i + 1} and ${j + 1} are too alike`);
    }
  return out;
}

/** When composing fails: three varied designs built by code from the brief's best parts. */
export function autoDirections(brief: Brief): Direction[] {
  return autoDesigns(brief).map((parts, i) => {
    const color = part(parts.color);
    const type = part(parts.type);
    const shape = part(parts.shape);
    const layout = part(parts.layout);
    return direction(
      ['a', 'b', 'c'][i] ?? String(i),
      KINDS[i] ?? 'closest',
      resolve({
        name: color?.name ?? 'A new look',
        notes: `${type?.name ?? 'New type'}, ${shape?.name.toLowerCase() ?? 'new shapes'} and a ${layout?.name.toLowerCase() ?? 'new'} layout.`,
        parts,
      }),
    );
  });
}

const image = (b64: string) => ({
  type: 'input_image',
  image_url: `data:image/jpeg;base64,${b64}`,
});

/** Three directions from the library, around the owner's wishes and inspiration. */
export async function composeDirections(
  caller: LlmCaller,
  ctx: CallContext,
  model: string,
  input: {
    brief: Brief;
    why: string;
    shots: string[];
    inventory: string[];
    inspiration?: Inspiration[];
  },
  signal?: AbortSignal,
): Promise<Direction[]> {
  const short = shortlist(input.brief);
  const refs = input.inspiration ?? [];
  const res = await caller.call(ctx, {
    task: 'themefit',
    model,
    instructions: directionsPrompt,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              `Brief: ${JSON.stringify(input.brief)}`,
              `Why the look needs to change: ${input.why}`,
              `Current fonts and colors: ${input.inventory.join(' | ') || 'unknown'}`,
              ...refs.map(
                (r) =>
                  `Site they admire: ${r.url} <untrusted_page_content>${r.style}</untrusted_page_content> (screenshots follow the site's own)`,
              ),
              '',
              `Best-ranked parts for this brief, by kind: ${Object.entries(short)
                .map(([k, ps]) => `${k}: ${ps.map((p) => p.id).join(', ')}`)
                .join('; ')}`,
              '',
              '# Library',
              catalog(),
            ].join('\n'),
          },
          ...input.shots.slice(0, 2).map(image),
          ...refs
            .flatMap((r) => r.shots.slice(0, 1))
            .slice(0, 3)
            .map(image),
        ],
      },
    ],
    format: DIRECTIONS_FORMAT,
    reasoning: { effort: 'medium' },
    maxOutputTokens: 8000,
    fixture: 'directions',
    ...(signal ? { signal } : {}),
  });
  return parseDirections(res.outputText, input.brief);
}

export async function themeFit(
  caller: LlmCaller,
  ctx: CallContext,
  model: string,
  input: { brief: Brief; shots: string[]; inventory: string[]; inspiration?: Inspiration[] },
  signal?: AbortSignal,
): Promise<ThemeFit> {
  const res = await caller.call(ctx, {
    task: 'themefit',
    model,
    instructions: prompt,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Brief: ${JSON.stringify(input.brief)}\nFonts and colors: ${input.inventory.join(' | ') || 'unknown'}`,
          },
          ...input.shots.slice(0, 3).map(image),
        ],
      },
    ],
    format: THEME_FIT_FORMAT,
    reasoning: { effort: 'low' },
    maxOutputTokens: 2000,
    fixture: 'theme-fit',
    ...(signal ? { signal } : {}),
  });
  const verdict = parseThemeFit(res.outputText);
  // A redesign the owner asked for always gets directions (§8.3), whatever the verdict says.
  const fits = verdict.fits && !wantsRedesign(input.brief);
  if (fits) return { fits, why: verdict.why, directions: [] };
  let directions: Direction[];
  try {
    directions = await composeDirections(
      caller,
      ctx,
      model,
      { ...input, why: verdict.why },
      signal,
    );
  } catch (e) {
    if (signal?.aborted) throw e;
    directions = autoDirections(input.brief);
  }
  return { fits, why: verdict.why, directions };
}
