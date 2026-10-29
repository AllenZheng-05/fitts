// V1 follow-up: structured output with a realistic token budget, and which reasoning efforts work.
import OpenAI from 'openai';
import { canSpend, key, log, META_BASE_URL, recordSpend, saveResult, tokenCost } from './_lib';

const apiKey = key('META_API_KEY');
if (!apiKey) process.exit(0);
const client = new OpenAI({ apiKey, baseURL: META_BASE_URL, maxRetries: 1, timeout: 120_000 });
const results: Record<string, unknown> = {};

const format = {
  type: 'json_schema',
  name: 'finding',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      heuristic: {
        type: 'string',
        enum: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10'],
      },
      severity: { type: 'integer' },
    },
    required: ['title', 'heuristic', 'severity'],
    additionalProperties: false,
  },
};

async function run(name: string, model: string, effort: string, maxOut: number) {
  if (!canSpend(0.05)) return;
  const t = Date.now();
  try {
    const res = (await client.responses.create({
      model,
      input:
        'A message composer shows the recipient as "(null)". Report it as one usability finding.',
      text: { format },
      reasoning: { effort },
      store: false,
      max_output_tokens: maxOut,
    } as never)) as unknown as {
      output_text?: string;
      status?: string;
      usage?: Parameters<typeof tokenCost>[1] & {
        output_tokens_details?: { reasoning_tokens?: number };
      };
      incomplete_details?: unknown;
    };
    const usd = tokenCost(model, res.usage);
    recordSpend('v1b', usd, name);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(res.output_text ?? '');
    } catch {
      parsed = 'unparseable';
    }
    results[name] = {
      ok: true,
      ms: Date.now() - t,
      usd,
      status: res.status,
      incomplete: res.incomplete_details,
      reasoningTokens: res.usage?.output_tokens_details?.reasoning_tokens,
      outputTokens: res.usage?.output_tokens,
      parsed,
    };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    results[name] = { ok: false, status: err.status, message: err.message };
  }
  log(name, results[name]);
}

await run('spark-low-2000', 'muse-spark-1.3', 'low', 2000);
await run('spark-minimal', 'muse-spark-1.3', 'minimal', 2000);
await run('spark-none', 'muse-spark-1.3', 'none', 2000);
await run('contributor-low', 'muse-spark-1.3-contributor', 'low', 2000);
await run('wonder-low-3000', 'muse-wonder-1.0', 'low', 3000);
saveResult('v1b-schema', results);
