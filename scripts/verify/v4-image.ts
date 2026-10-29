// V4: /v1/images/edits with muse-image-1.0 and a real screenshot as the source image.
import OpenAI, { toFile } from 'openai';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canSpend, key, log, META_BASE_URL, recordSpend, ROOT, saveResult } from './_lib';

const apiKey = key('META_API_KEY');
if (!apiKey) process.exit(0);
const shotPath = process.argv[2];
if (!shotPath) throw new Error('usage: v4-image.ts <shot.png>');
const client = new OpenAI({ apiKey, baseURL: META_BASE_URL, maxRetries: 1, timeout: 240_000 });
const results: Record<string, unknown> = {};

if (canSpend(0.02)) {
  const started = Date.now();
  try {
    const res = await client.images.edit({
      model: 'muse-image-1.0',
      image: await toFile(readFileSync(shotPath), 'shot.png', { type: 'image/png' }),
      prompt:
        'Redesign this web page in a quiet, dignified style: navy and stone colors, a serif typeface, no confetti, no tilted buttons. Keep the same layout and text.',
      n: 1,
    } as never);
    recordSpend('v4', 0.01, 'muse-image-1.0 one edit');
    const first = res.data?.[0];
    let saved: string | undefined;
    if (first?.b64_json) {
      saved = join(ROOT, '.fitts-dev', 'verify', 'v4-mockup.png');
      writeFileSync(saved, Buffer.from(first.b64_json, 'base64'));
    }
    results['edit'] = {
      ok: true,
      ms: Date.now() - started,
      fields: first ? Object.keys(first) : [],
      hasB64: Boolean(first?.b64_json),
      hasUrl: Boolean(first?.url),
      usage: (res as { usage?: unknown }).usage,
      saved,
    };
  } catch (e) {
    const err = e as { status?: number; message?: string; error?: unknown };
    results['edit'] = {
      ok: false,
      ms: Date.now() - started,
      status: err.status,
      message: err.message,
      error: err.error,
    };
  }
  log('edit', results['edit']);
}
saveResult('v4-image', results);
