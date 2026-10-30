// Every model call goes through here (SPEC-phase2 §2): retries with backoff on 429/5xx/timeouts,
// the x-ratelimit headers, aborts (⌘.), budget refusal, and one ledger entry per call.
// This folder is the only place the agent makes network calls.
import type { CostTask } from '@fitts/schema';
import OpenAI from 'openai';
import { PHASE_OF, type CostLedger } from '../ledger/ledger';
import { PRICE_TABLE, tokenUsd } from './pricing';
import { BASETEN_BASE_URL, META_BASE_URL } from './test-key';

export type Provider = 'meta' | 'baseten';

/** A Responses-API-shaped request; Baseten requests are translated to chat completions. */
export interface LlmRequest {
  task: CostTask;
  model: string;
  provider?: Provider;
  instructions?: string;
  input: string | unknown[];
  tools?: unknown[];
  /** `text.format` (JSON schema) for structured output. */
  format?: unknown;
  reasoning?: { effort: 'minimal' | 'low' | 'medium' | 'high'; summary?: 'auto' };
  /** At least 2000: reasoning alone uses 300–650 tokens (V1). */
  maxOutputTokens?: number;
  findingId?: string;
  /** Which recorded fixture answers this call in tests. */
  fixture?: string;
  signal?: AbortSignal;
}

export interface LlmUsage {
  input: number;
  cached: number;
  output: number;
  reasoning: number;
}

export interface LlmResponse {
  outputText: string;
  /** Output items (Responses shape): messages, function_call items, reasoning. */
  output: { type: string; [k: string]: unknown }[];
  usage: LlmUsage;
  model: string;
}

export interface LlmClient {
  respond(req: LlmRequest): Promise<LlmResponse>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class BudgetExceeded extends Error {
  constructor() {
    super('The run has reached its spending cap');
  }
}

const RETRYABLE = (status: number | undefined) =>
  status === undefined || status === 408 || status === 409 || status === 429 || status >= 500;

function toLlmError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  const err = e as { status?: number; message?: string; name?: string };
  if (err.name === 'AbortError' || err.name === 'APIUserAbortError') throw e;
  return new LlmError(err.message ?? 'model call failed', err.status, RETRYABLE(err.status));
}

/** Meta's Responses API (V1). */
export function metaClient(
  apiKey: string,
  onRateLimit?: (h: Record<string, string>) => void,
): LlmClient {
  const client = new OpenAI({ apiKey, baseURL: META_BASE_URL, maxRetries: 0, timeout: 120_000 });
  return {
    async respond(req) {
      try {
        const { data, response } = await client.responses
          .create(
            {
              model: req.model,
              input: req.input as never,
              store: false,
              max_output_tokens: Math.max(2000, req.maxOutputTokens ?? 4000),
              ...(req.instructions ? { instructions: req.instructions } : {}),
              ...(req.tools ? { tools: req.tools as never } : {}),
              ...(req.format ? { text: { format: req.format as never } } : {}),
              ...(req.reasoning ? { reasoning: req.reasoning } : {}),
            },
            req.signal ? { signal: req.signal } : {},
          )
          .withResponse();
        const limits: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          if (k.startsWith('x-ratelimit')) limits[k] = v;
        });
        if (Object.keys(limits).length) onRateLimit?.(limits);
        const u = data.usage;
        return {
          outputText: data.output_text ?? '',
          output: data.output as unknown as LlmResponse['output'],
          model: req.model,
          usage: {
            input: u?.input_tokens ?? 0,
            cached: u?.input_tokens_details?.cached_tokens ?? 0,
            output: u?.output_tokens ?? 0,
            reasoning: u?.output_tokens_details?.reasoning_tokens ?? 0,
          },
        };
      } catch (e) {
        throw toLlmError(e);
      }
    },
  };
}

/** Responses-style input → chat messages (text only). */
function toMessages(req: LlmRequest): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  if (req.instructions) messages.push({ role: 'system', content: req.instructions });
  if (typeof req.input === 'string') return [...messages, { role: 'user', content: req.input }];
  for (const item of req.input as { role?: string; content?: unknown }[]) {
    const role = item.role === 'assistant' || item.role === 'system' ? item.role : 'user';
    const content = Array.isArray(item.content)
      ? (item.content as { type?: string; text?: string }[])
          .filter((c) => typeof c.text === 'string')
          .map((c) => c.text)
          .join('\n')
      : typeof item.content === 'string'
        ? item.content
        : '';
    messages.push({ role, content });
  }
  return messages;
}

/** Baseten's OpenAI-compatible chat completions for Muse Spark Open (V7). */
export function basetenClient(apiKey: string): LlmClient {
  const client = new OpenAI({ apiKey, baseURL: BASETEN_BASE_URL, maxRetries: 0, timeout: 120_000 });
  return {
    async respond(req) {
      try {
        const tools = (
          req.tools as { name: string; description?: string; parameters: unknown }[] | undefined
        )?.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description ?? '',
            parameters: t.parameters as Record<string, unknown>,
          },
        }));
        const res = await client.chat.completions.create(
          {
            model: req.model,
            messages: toMessages(req),
            max_tokens: Math.max(2000, req.maxOutputTokens ?? 4000),
            ...(tools ? { tools } : {}),
            ...(req.format
              ? {
                  // Chat completions take { name, schema, strict } (no `type` inside).
                  response_format: {
                    type: 'json_schema',
                    json_schema: { ...(req.format as Record<string, unknown>), type: undefined },
                  } as never,
                }
              : {}),
          },
          req.signal ? { signal: req.signal } : {},
        );
        const msg = res.choices[0]?.message;
        const output: LlmResponse['output'] = [];
        if (msg?.content)
          output.push({ type: 'message', content: [{ type: 'output_text', text: msg.content }] });
        for (const call of msg?.tool_calls ?? []) {
          if (call.type === 'function')
            output.push({
              type: 'function_call',
              call_id: call.id,
              name: call.function.name,
              arguments: call.function.arguments,
            });
        }
        const u = res.usage;
        return {
          outputText: msg?.content ?? '',
          output,
          model: req.model,
          usage: {
            input: u?.prompt_tokens ?? 0,
            cached: u?.prompt_tokens_details?.cached_tokens ?? 0,
            output: u?.completion_tokens ?? 0,
            reasoning: u?.completion_tokens_details?.reasoning_tokens ?? 0,
          },
        };
      } catch (e) {
        throw toLlmError(e);
      }
    },
  };
}

export interface CallContext {
  runId: string;
  projectId: string;
  contributor: boolean;
  /** False while the run is at its cap: new calls are refused. */
  allowed: () => boolean;
}

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(abortError());
    });
  });

/**
 * The wrapper every agent module uses. `onTrouble` fires after 3 failed attempts in a row (the
 * api-trouble card, §6.3).
 */
export class LlmCaller {
  constructor(
    private readonly clientFor: (provider: Provider) => LlmClient | undefined,
    private readonly ledger: CostLedger,
    private readonly opts: {
      retries?: number;
      baseDelayMs?: number;
      onTrouble?: (e: LlmError) => void;
    } = {},
  ) {}

  async call(ctx: CallContext, req: LlmRequest): Promise<LlmResponse> {
    if (!ctx.allowed()) throw new BudgetExceeded();
    const provider = req.provider ?? (req.model.startsWith('meta-models/') ? 'baseten' : 'meta');
    const client = this.clientFor(provider);
    if (!client) throw new LlmError(`No ${provider} key`, 401, false);
    const attempts = (this.opts.retries ?? 3) + 1;
    let lastError: LlmError | undefined;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (req.signal?.aborted) throw abortError();
      const started = Date.now();
      try {
        const res = await client.respond(req);
        const usd = tokenUsd(req.model, res.usage);
        this.ledger.record({
          ts: new Date().toISOString(),
          runId: ctx.runId,
          projectId: ctx.projectId,
          task: req.task,
          phase: PHASE_OF[req.task],
          provider,
          model: req.model,
          contributor: ctx.contributor,
          inputTokens: res.usage.input,
          cachedTokens: res.usage.cached,
          outputTokens: res.usage.output,
          reasoningTokens: res.usage.reasoning,
          usd,
          latencyMs: Date.now() - started,
          ...(req.findingId ? { findingId: req.findingId } : {}),
          priceTable: PRICE_TABLE,
        });
        return res;
      } catch (e) {
        const err = toLlmError(e);
        lastError = err;
        if (!err.retryable || attempt === attempts - 1) break;
        const base = this.opts.baseDelayMs ?? 1000;
        await sleep(base * 2 ** attempt + Math.random() * base * 0.25, req.signal);
      }
    }
    if (lastError?.retryable) this.opts.onTrouble?.(lastError);
    throw lastError ?? new LlmError('model call failed', undefined, false);
  }
}
