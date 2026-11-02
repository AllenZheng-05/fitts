// Brand fit on Android (A9, Nov 2): the theme check run on the phone's screenshots, against the
// brief and the brand cues in the screens themselves (the wordmark, splash and photos). When the
// in-app theme drifts from the brand, the run posts one finding ("Doesn't match your brand"),
// never a redesign card: on a phone it's a fix to the theme, not a new look.
import brandPrompt from '../../../../../docs/prompts/brand-fit.md?raw';
import type { Brief, FindingDraft } from '@fitts/schema';
import { retryUnusable, UnusableAnswer, type CallContext, type LlmCaller } from '../llm/call';

/** The persona the aggregator counts the brand check's vote under. */
export const BRAND_PERSONA = 'Brand check';

export interface BrandFit {
  fits: boolean;
  onBrand: string;
  offBrand: string;
  tokens: string[];
  why: string;
}

export const BRAND_FIT_FORMAT = {
  type: 'json_schema',
  name: 'brand_fit',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      fits: { type: 'boolean' },
      onBrand: { type: 'string' },
      offBrand: { type: 'string' },
      tokens: { type: 'array', items: { type: 'string' } },
      why: { type: 'string' },
    },
    required: ['fits', 'onBrand', 'offBrand', 'tokens', 'why'],
    additionalProperties: false,
  },
};

/** Asks once (retrying an unreadable answer); null when there's no verdict to act on. */
export async function brandFit(
  caller: LlmCaller,
  ctx: CallContext,
  model: string,
  input: { brief: Brief; shots: string[]; tokens: string[] },
  signal?: AbortSignal,
): Promise<BrandFit | null> {
  const ask = async (): Promise<BrandFit> => {
    const res = await caller.call(ctx, {
      task: 'themefit',
      model,
      instructions: brandPrompt,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                '<untrusted_app_data>',
                `Brief: ${JSON.stringify(input.brief)}`,
                `Theme tokens in the code: ${input.tokens.join(', ') || 'unknown'}`,
                '</untrusted_app_data>',
              ].join('\n'),
            },
            ...input.shots.slice(0, 4).map((s) => ({
              type: 'input_image',
              // A PNG (a recorded screencap) is labeled as one; the run's shots are JPEGs.
              image_url: `data:image/${s.startsWith('iVBOR') ? 'png' : 'jpeg'};base64,${s}`,
            })),
          ],
        },
      ],
      format: BRAND_FIT_FORMAT,
      reasoning: { effort: 'low' },
      maxOutputTokens: 2000,
      fixture: 'brand-fit',
      ...(signal ? { signal } : {}),
    });
    let out: Partial<BrandFit>;
    try {
      out = JSON.parse(res.outputText) as Partial<BrandFit>;
    } catch {
      throw new UnusableAnswer('not JSON');
    }
    if (typeof out.fits !== 'boolean') throw new UnusableAnswer('no verdict');
    const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : '');
    return {
      fits: out.fits,
      onBrand: str(out.onBrand),
      offBrand: str(out.offBrand),
      tokens: Array.isArray(out.tokens)
        ? out.tokens.filter((t): t is string => typeof t === 'string').slice(0, 8)
        : [],
      why: str(out.why),
    };
  };
  try {
    return await retryUnusable(ask);
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') throw e;
    return null;
  }
}

/** A misfit as the brand check's finding draft, citing the screens it looked at. */
export function brandDraft(v: BrandFit, evidenceIds: string[]): FindingDraft {
  return {
    title: 'Doesn’t match your brand',
    finding: [v.onBrand, v.offBrand].filter(Boolean).join(' ') || v.why,
    fix: v.tokens.length
      ? `Bring the theme back to the brand: ${v.tokens.join(', ')}, from the wordmark’s colors and type.`
      : 'Bring the theme’s colors and fonts back to the brand the wordmark and photos carry.',
    heuristic: 'H4',
    lens: 'look-and-feel',
    severity: 2,
    elementRef: null,
    evidenceIds,
    evidence: [
      ...(v.onBrand ? [`On brand: ${v.onBrand}`] : []),
      ...(v.offBrand ? [`Off brand: ${v.offBrand}`] : []),
      ...(v.tokens.length ? [`Theme tokens that look off: ${v.tokens.join(', ')}`] : []),
    ],
    expected: 'The app’s theme carries the same brand as its wordmark, splash and photos.',
    actual: v.offBrand || v.why,
  };
}
