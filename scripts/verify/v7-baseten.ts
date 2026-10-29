// V7: Baseten Model API with an OpenAI-compatible client and meta-models/muse-spark-open-1026.
import OpenAI from 'openai';
import { canSpend, key, log, recordSpend, saveResult, tokenCost } from './_lib';

const apiKey = key('BASETEN_API_KEY');
if (!apiKey) {
  log('BLOCKED: no BASETEN_API_KEY');
  process.exit(0);
}
const MODEL = 'meta-models/muse-spark-open-1026';
const results: Record<string, unknown> = {};

for (const baseURL of ['https://inference.baseten.co/v1']) {
  const client = new OpenAI({ apiKey, baseURL, maxRetries: 1, timeout: 120_000 });
  try {
    const models = await client.models.list();
    results[`${baseURL}:models`] = models.data
      .map((m) => m.id)
      .filter((id) => id.includes('muse') || id.includes('meta'));
  } catch (e) {
    results[`${baseURL}:models`] = {
      error: (e as { status?: number }).status,
      message: (e as Error).message,
    };
  }
  log('models', results[`${baseURL}:models`]);
  if (!canSpend(0.01)) break;
  const started = Date.now();
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: 'In one short sentence: why label the last step\'s button "Send"?',
        },
      ],
      max_tokens: 1500,
    });
    const u = res.usage;
    const usd = tokenCost(MODEL, {
      input_tokens: u?.prompt_tokens,
      output_tokens: u?.completion_tokens,
    });
    recordSpend('v7', usd, 'baseten chat');
    results[`${baseURL}:chat`] = {
      ok: true,
      ms: Date.now() - started,
      usage: u,
      usd,
      text: res.choices[0]?.message.content?.slice(0, 300),
    };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    results[`${baseURL}:chat`] = {
      ok: false,
      ms: Date.now() - started,
      status: err.status,
      message: err.message,
    };
  }
  log('chat', results[`${baseURL}:chat`]);
  // Tool calling through chat completions.
  const started2 = Date.now();
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content:
            'Elements: [e1 button "NEXT"] [e2 link "Help"]. Click the button that moves the form forward.',
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'click',
            parameters: {
              type: 'object',
              properties: { ref: { type: 'string' } },
              required: ['ref'],
            },
          },
        },
      ],
      max_tokens: 1500,
    });
    recordSpend(
      'v7',
      tokenCost(MODEL, {
        input_tokens: res.usage?.prompt_tokens,
        output_tokens: res.usage?.completion_tokens,
      }),
      'baseten tools',
    );
    results[`${baseURL}:tools`] = {
      ok: true,
      ms: Date.now() - started2,
      toolCalls: res.choices[0]?.message.tool_calls,
    };
  } catch (e) {
    results[`${baseURL}:tools`] = {
      ok: false,
      status: (e as { status?: number }).status,
      message: (e as Error).message,
    };
  }
  log('tools', results[`${baseURL}:tools`]);
}
saveResult('v7-baseten', results);
