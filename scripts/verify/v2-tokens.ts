// V2: tokens and cost of one screenshot plus ~3k tokens of probe JSON (count-input-tokens).
import OpenAI from 'openai';
import { readFileSync } from 'node:fs';
import {
  canSpend,
  key,
  log,
  META_BASE_URL,
  PRICES,
  recordSpend,
  saveResult,
  tokenCost,
} from './_lib';

const apiKey = key('META_API_KEY');
if (!apiKey) process.exit(0);
const shotPath = process.argv[2];
if (!shotPath) throw new Error('usage: v2-tokens.ts <screenshot.png|jpg>');
const client = new OpenAI({ apiKey, baseURL: META_BASE_URL, maxRetries: 1, timeout: 120_000 });

const mime = shotPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
const image = `data:${mime};base64,${readFileSync(shotPath).toString('base64')}`;
// ~12k characters of probe-like JSON (~3k tokens).
const items = Array.from({ length: 60 }, (_, i) => ({
  ref: `e${i}`,
  selector: `main > section:nth-child(${i}) button.send`,
  measured: { width: 28, height: 20, contrast: 2.6 },
  expected: { minTarget: 24, minContrast: 4.5 },
  src: `src/routes/Compose.tsx:${40 + i}:7`,
}));
const probes = JSON.stringify({
  probe: 'target-size',
  route: '/compose/confirm',
  pass: false,
  items,
});

const input = [
  {
    role: 'user',
    content: [
      { type: 'input_text', text: `<untrusted_page_content>${probes}</untrusted_page_content>` },
      { type: 'input_image', image_url: image, detail: 'auto' },
    ],
  },
];
const results: Record<string, unknown> = { probeChars: probes.length };

for (const model of ['muse-spark-1.3', 'muse-spark-1.3-contributor']) {
  try {
    const res = (await client.post('/responses/input_tokens', { body: { model, input } })) as {
      input_tokens?: number;
    };
    const tokens = res.input_tokens ?? 0;
    results[`${model}:count`] = {
      ok: true,
      tokens,
      estUsd: (tokens * (PRICES[model]?.in ?? 0)) / 1e6,
    };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    results[`${model}:count`] = { ok: false, status: err.status, message: err.message };
  }
  log(`${model}:count`, results[`${model}:count`]);
}

// Text-only count, to separate the image's share.
try {
  const res = (await client.post('/responses/input_tokens', {
    body: {
      model: 'muse-spark-1.3',
      input: [{ role: 'user', content: [{ type: 'input_text', text: probes }] }],
    },
  })) as { input_tokens?: number };
  results['textOnly'] = res.input_tokens;
  log('textOnly', res.input_tokens);
} catch (e) {
  results['textOnly'] = (e as Error).message;
}

// One real cheap call to confirm the usage numbers match the count.
if (canSpend(0.01)) {
  const model = 'muse-spark-1.3-contributor';
  const res = (await client.responses.create({
    model,
    input: [...input, { role: 'user', content: [{ type: 'input_text', text: 'Reply with OK.' }] }],
    reasoning: { effort: 'minimal' },
    store: false,
    max_output_tokens: 2000,
  } as never)) as unknown as { usage?: Parameters<typeof tokenCost>[1] };
  const usd = tokenCost(model, res.usage);
  recordSpend('v2', usd, 'screenshot+probe call');
  results['realCall'] = { usage: res.usage, usd };
  log('realCall', results['realCall']);
}
saveResult('v2-tokens', results);
