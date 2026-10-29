// V3: SAM 3.1 through the Responses API with a box prompt; parse with @meta-sam/parser.
import {
  buildObjectPrompt,
  decodeMaskToSVGPath,
  parseImageStream,
  recordsOfKind,
} from '@meta-sam/parser';
import OpenAI from 'openai';
import { readFileSync } from 'node:fs';
import { canSpend, key, log, META_BASE_URL, recordSpend, saveResult } from './_lib';

const apiKey = key('META_API_KEY');
if (!apiKey) process.exit(0);
const [shotPath, w, h, l, t, r, b] = process.argv.slice(2);
if (!shotPath) throw new Error('usage: v3-sam.ts <shot> <w> <h> <left> <top> <right> <bottom>');
const client = new OpenAI({ apiKey, baseURL: META_BASE_URL, maxRetries: 1, timeout: 180_000 });
const mime = shotPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
const image = `data:${mime};base64,${readFileSync(shotPath).toString('base64')}`;

const prompt = buildObjectPrompt({
  size: { width: Number(w), height: Number(h) },
  objects: [
    {
      id: 1,
      prompts: [{ box: { left: Number(l), top: Number(t), right: Number(r), bottom: Number(b) } }],
    },
  ],
});
log('prompt', prompt);
const results: Record<string, unknown> = { prompt };

if (canSpend(0.01)) {
  const started = Date.now();
  try {
    const stream = await client.responses.create({
      model: 'sam-3.1',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_image', image_url: image },
            { type: 'input_text', text: prompt },
          ],
        },
      ],
      stream: true,
      store: false,
    } as never);
    const result = await parseImageStream(stream as never).finalResult;
    recordSpend('v3', 0.0025, 'sam-3.1 one image');
    const masks = recordsOfKind(result.records, 'mask');
    results['sam'] = {
      ok: true,
      ms: Date.now() - started,
      outcome: result.outcome,
      diagnostics: result.diagnostics,
      records: result.records.length,
      masks: masks.map((m) => ({
        id: m.objectId,
        bounds: m.bounds,
        w: m.mask.width,
        h: m.mask.height,
        svgPathChars: decodeMaskToSVGPath(m.mask).length,
      })),
      raw: result.rawOutput?.slice(0, 300),
    };
  } catch (e) {
    const err = e as { status?: number; message?: string; error?: unknown };
    results['sam'] = {
      ok: false,
      ms: Date.now() - started,
      status: err.status,
      message: err.message,
      error: err.error,
    };
  }
  log('sam', results['sam']);
}
saveResult('v3-sam', results);
