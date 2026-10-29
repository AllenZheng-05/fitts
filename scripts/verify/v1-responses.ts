// V1: Meta Responses API — tool calling, reasoning summary, encrypted reasoning, JSON schema.
import OpenAI from 'openai';
import { canSpend, key, log, META_BASE_URL, recordSpend, saveResult, tokenCost } from './_lib';

const apiKey = key('META_API_KEY');
if (!apiKey) {
  log('BLOCKED: no META_API_KEY');
  process.exit(0);
}
const client = new OpenAI({ apiKey, baseURL: META_BASE_URL, maxRetries: 1, timeout: 120_000 });
const results: Record<string, unknown> = {};

async function attempt(name: string, model: string, body: Record<string, unknown>) {
  if (!canSpend(0.05)) return;
  const started = Date.now();
  try {
    const res = (await client.responses.create({ model, ...body } as never)) as unknown as {
      id: string;
      output: { type: string; [k: string]: unknown }[];
      output_text?: string;
      usage?: Parameters<typeof tokenCost>[1] & {
        output_tokens_details?: { reasoning_tokens?: number };
      };
    };
    const usd = tokenCost(model, res.usage);
    recordSpend('v1', usd, `${name} ${model}`);
    results[name] = {
      ok: true,
      ms: Date.now() - started,
      usd,
      usage: res.usage,
      outputTypes: res.output.map((o) => o.type),
      functionCalls: res.output
        .filter((o) => o.type === 'function_call')
        .map((o) => ({ name: o['name'], arguments: o['arguments'] })),
      reasoning: res.output
        .filter((o) => o.type === 'reasoning')
        .map((o) => ({
          summary: o['summary'],
          hasEncrypted:
            typeof o['encrypted_content'] === 'string' && o['encrypted_content'].length > 0,
        })),
      text: res.output_text?.slice(0, 400),
    };
    log(`OK ${name}`, results[name]);
  } catch (e) {
    const err = e as { status?: number; message?: string; error?: unknown };
    results[name] = {
      ok: false,
      ms: Date.now() - started,
      status: err.status,
      message: err.message,
      error: err.error,
    };
    log(`FAIL ${name}`, results[name]);
  }
}

const tool = {
  type: 'function',
  name: 'click',
  description: 'Click an element on the page by its ref.',
  parameters: {
    type: 'object',
    properties: { ref: { type: 'string' }, reason: { type: 'string' } },
    required: ['ref', 'reason'],
    additionalProperties: false,
  },
  strict: true,
};

const schema = {
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
      severity: { type: 'integer', minimum: 1, maximum: 4 },
    },
    required: ['title', 'heuristic', 'severity'],
    additionalProperties: false,
  },
};

const models = await client.models.list().then(
  (page) => page.data.map((m) => m.id),
  (e: { status?: number; message?: string }) => ({ error: e.status, message: e.message }),
);
results['models'] = models;
log('models', models);

for (const model of ['muse-spark-1.3', 'muse-wonder-1.0']) {
  await attempt(`${model}:reasoning`, model, {
    input: 'In one sentence: why should a Send button say "Send" on the last step of a form?',
    reasoning: { effort: 'low', summary: 'auto' },
    include: ['reasoning.encrypted_content'],
    store: false,
    max_output_tokens: 400,
  });
  await attempt(`${model}:tools`, model, {
    input:
      'Page elements: [ref=e1 button "NEXT"] [ref=e2 link "Help"]. Click the button that moves the form forward.',
    tools: [tool],
    tool_choice: 'auto',
    reasoning: { effort: 'low' },
    store: false,
    max_output_tokens: 400,
  });
  await attempt(`${model}:schema`, model, {
    input:
      'A message composer shows the recipient as "(null)". Report it as one usability finding.',
    text: { format: schema },
    reasoning: { effort: 'low' },
    store: false,
    max_output_tokens: 400,
  });
}

saveResult('v1-responses', results);
