// Theme-fit (SPEC-phase2 §8.3): once per run, after the first 3 routes, a model judges whether
// the site's look suits who it's for. When it doesn't, the run posts the `lookfeel` card and 3
// directions. (Mockups are P10; applying a direction is the fix pipeline, P9.)
import type { Brief } from '@fitts/schema';
import prompt from '../../../../../docs/prompts/theme-fit.md?raw';
import type { CallContext, LlmCaller } from '../llm/call';

export interface Direction {
  id: string;
  name: string;
  swatches: string[];
  typeface: string;
  notes: string;
}

export interface ThemeFit {
  fits: boolean;
  why: string;
  directions: Direction[];
}

export const THEME_FIT_FORMAT = {
  type: 'json_schema',
  name: 'theme_fit',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      fits: { type: 'boolean' },
      why: { type: 'string' },
      directions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            swatches: { type: 'array', items: { type: 'string' } },
            typeface: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['id', 'name', 'swatches', 'typeface', 'notes'],
          additionalProperties: false,
        },
      },
    },
    required: ['fits', 'why', 'directions'],
    additionalProperties: false,
  },
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Checks the verdict; a "doesn't fit" without 3 usable directions isn't usable. */
export function parseThemeFit(text: string): ThemeFit {
  const raw = JSON.parse(text) as Partial<ThemeFit>;
  const why = typeof raw.why === 'string' ? raw.why.trim().slice(0, 400) : '';
  const directions = (Array.isArray(raw.directions) ? raw.directions : [])
    .map((d, i) => ({
      id: ['a', 'b', 'c'][i] ?? String(i),
      name: String(d.name ?? '').slice(0, 40),
      swatches: (Array.isArray(d.swatches) ? d.swatches : [])
        .filter((c) => HEX.test(c))
        .slice(0, 4),
      typeface: String(d.typeface ?? '').slice(0, 60),
      notes: String(d.notes ?? '').slice(0, 200),
    }))
    .filter((d) => d.name && d.swatches.length >= 2)
    .slice(0, 3);
  const fits = raw.fits === true;
  if (!why || (!fits && directions.length < 3)) throw new Error('unusable theme-fit verdict');
  return { fits, why, directions: fits ? [] : directions };
}

export async function themeFit(
  caller: LlmCaller,
  ctx: CallContext,
  model: string,
  input: { brief: Brief; shots: string[]; inventory: string[] },
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
          ...input.shots
            .slice(0, 3)
            .map((s) => ({ type: 'input_image', image_url: `data:image/jpeg;base64,${s}` })),
        ],
      },
    ],
    format: THEME_FIT_FORMAT,
    reasoning: { effort: 'low' },
    maxOutputTokens: 4000,
    fixture: 'theme-fit',
    ...(signal ? { signal } : {}),
  });
  const verdict = parseThemeFit(res.outputText);
  // A redesign the user asked for always gets directions (§8.3); a "fits" without them can't.
  if (input.brief.look && verdict.fits) throw new Error('a requested redesign needs directions');
  return verdict;
}
