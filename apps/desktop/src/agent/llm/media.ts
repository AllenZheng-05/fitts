// SAM 3.1 outlines and Muse Image mockups (SPEC-phase2 §10, V3/V4). Both bill the `media` cost
// phase. SAM failures return null, and the UI keeps its DOM box.
import {
  buildObjectPrompt,
  decodeMaskToSVGPath,
  parseImageStream,
  recordsOfKind,
} from '@meta-sam/parser';
import OpenAI, { toFile } from 'openai';
import type { CostLedger } from '../ledger/ledger';
import { PHASE_OF } from '../ledger/ledger';
import { IMAGE_USD, PRICE_TABLE, SAM_USD_PER_IMAGE } from './pricing';
import { META_BASE_URL } from './test-key';

export const SAM_MODEL = 'sam-3.1';
export const IMAGE_MODEL = 'muse-image-1.0';

export interface MediaContext {
  runId: string;
  projectId: string;
  findingId?: string;
  allowed: () => boolean;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The outline as a standalone SVG over the shot (stored as an asset, drawn over the shot). */
/**
 * SAM's outline in page coordinates. The mask's raster covers only the record's box (`bounds`),
 * possibly at another resolution, so its path starts at 0,0 there: drawn as is, the outline
 * sat at the page's top-left (Nov 2, found by the site session). Every point is scaled to the
 * box and moved to it, so an outline is drawn over the whole shot, like the shot itself.
 */
export function placeOutline(
  path: string,
  bounds: { left: number; top: number; right: number; bottom: number },
  raster: { width: number; height: number },
): string {
  const sx = (bounds.right - bounds.left) / Math.max(1, raster.width);
  const sy = (bounds.bottom - bounds.top) / Math.max(1, raster.height);
  const n = (v: number) => Math.round(v * 100) / 100;
  return path.replace(
    /([ML])\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g,
    (_, cmd: string, x: string, y: string) =>
      `${cmd}${n(bounds.left + Number(x) * sx)} ${n(bounds.top + Number(y) * sy)}`,
  );
}

/** An outline (page coordinates) as an SVG the size of the shot it's drawn over. */
export function outlineSvg(path: string, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><path d="${path}" fill="rgba(255,111,89,0.18)" stroke="#e5533d" stroke-width="3" stroke-linejoin="round"/></svg>`;
}

/** The instruction for a finding's mockup (§10): the fix, drawn, without changing anything else. */
export const findingInstruction = (title: string, fix: string) =>
  `Edit this screenshot of a web page to show it after this fix: ${fix} (the problem: ${title}). Change only what the fix needs; keep the layout, content and style otherwise identical. Photorealistic UI, no annotations.`;

/** The instruction for a redesign direction's mockup. */
export const directionInstruction = (d: {
  name: string;
  swatches: string[];
  typeface: string;
  notes: string;
  /** The design in words: shapes, layout, decoration and the direction's own changes. */
  detail?: string;
}) =>
  `Restyle this web page screenshot in the "${d.name}" direction: colors ${d.swatches.join(', ')}, typeface ${d.typeface}. ${d.notes}${d.detail ? ` ${d.detail}` : ''} Remove decorative elements that don't fit. Keep the same content. Photorealistic UI, no annotations.`;

/** The picture size nearest a screenshot's shape: wide, tall or square. */
export function sizeFor(aspect: number): '1536x1024' | '1024x1536' | '1024x1024' {
  if (aspect >= 1.2) return '1536x1024';
  if (aspect <= 0.83) return '1024x1536';
  return '1024x1024';
}

export class Media {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly ledger: CostLedger,
  ) {
    this.client = new OpenAI({ apiKey, baseURL: META_BASE_URL, maxRetries: 1, timeout: 120_000 });
  }

  private record(
    ctx: MediaContext,
    task: 'sam' | 'image',
    model: string,
    usd: number,
    started: number,
  ) {
    this.ledger.record({
      ts: new Date().toISOString(),
      runId: ctx.runId,
      projectId: ctx.projectId,
      task,
      phase: PHASE_OF[task],
      provider: 'meta',
      model,
      contributor: false,
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      ...(task === 'sam' ? { samImages: 1 } : { images: 1 }),
      usd,
      latencyMs: Date.now() - started,
      ...(ctx.findingId ? { findingId: ctx.findingId } : {}),
      priceTable: PRICE_TABLE,
    });
  }

  /** SAM with a box prompt on the shot → the element's outline as an SVG path, or null. */
  async outline(
    ctx: MediaContext,
    shot: { jpegBase64: string; width: number; height: number },
    box: Box,
  ): Promise<string | null> {
    if (!ctx.allowed()) return null;
    const prompt = buildObjectPrompt({
      size: { width: shot.width, height: shot.height },
      objects: [
        {
          id: 1,
          prompts: [
            {
              box: {
                left: Math.max(0, Math.round(box.left)),
                top: Math.max(0, Math.round(box.top)),
                right: Math.min(shot.width, Math.round(box.left + box.width)),
                bottom: Math.min(shot.height, Math.round(box.top + box.height)),
              },
            },
          ],
        },
      ],
    });
    const started = Date.now();
    try {
      const stream = await this.client.responses.create({
        model: SAM_MODEL,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_image', image_url: `data:image/jpeg;base64,${shot.jpegBase64}` },
              { type: 'input_text', text: prompt },
            ],
          },
        ],
        stream: true,
        store: false,
      } as never);
      const result = await parseImageStream(stream as never).finalResult;
      this.record(ctx, 'sam', SAM_MODEL, SAM_USD_PER_IMAGE, started);
      const mask = recordsOfKind(result.records, 'mask')[0];
      return mask ? placeOutline(decodeMaskToSVGPath(mask.mask), mask.bounds, mask.mask) : null;
    } catch {
      return null;
    }
  }

  /**
   * Muse Image edit of a PNG → a PNG (base64), or null. `aspect` is the screenshot's width over
   * its height, so the picture comes back the page's shape (a wide browser window, not a square
   * crop of one); if the service won't take a size, it's asked again without one.
   */
  async edit(
    ctx: MediaContext,
    pngBase64: string,
    prompt: string,
    aspect?: number,
  ): Promise<string | null> {
    if (!ctx.allowed()) return null;
    const started = Date.now();
    const size = aspect === undefined ? undefined : sizeFor(aspect);
    const once = async (withSize: boolean) => {
      const res = await this.client.images.edit({
        model: IMAGE_MODEL,
        image: await toFile(Buffer.from(pngBase64, 'base64'), 'shot.png', { type: 'image/png' }),
        prompt,
        ...(withSize && size ? { size } : {}),
      });
      this.record(ctx, 'image', IMAGE_MODEL, IMAGE_USD, started);
      return res.data?.[0]?.b64_json ?? null;
    };
    try {
      return await once(true);
    } catch {
      if (!size) return null;
      return once(false).catch(() => null);
    }
  }
}
