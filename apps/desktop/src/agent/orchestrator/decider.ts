// The decision step and the conversation (SPEC-phase3 §1.2, §1.3), on Spark. The decider calls
// one tool per decision; `converse` answers the owner while the work goes on.
import decidePrompt from '../../../../../docs/prompts/decide.md?raw';
import conversePrompt from '../../../../../docs/prompts/converse.md?raw';
import type { CallContext, LlmCaller } from '../llm/call';
import type { AbilityName, Decider, Decision, Situation } from './abilities';

const say = { type: 'string', description: 'One line to the owner, or empty.' };

const tool = (name: string, description: string, extra: Record<string, unknown> = {}) => ({
  type: 'function',
  name,
  description,
  parameters: {
    type: 'object',
    properties: { ...extra, say },
    required: [...Object.keys(extra), 'say'],
    additionalProperties: false,
  },
  strict: true,
});

const TOOLS = [
  tool('explore', 'Crawl: try every primary control, a page at a time.', {
    route: { type: 'string', description: 'A page of this site to open first, or empty.' },
  }),
  tool('phone_pass', 'Check every explored page at phone size.'),
  tool('check_links', 'Check links and network requests.'),
  tool('review', 'The five-reviewer panel on the explored pages.'),
  tool('check_theme', 'Judge whether the look fits the brief.'),
  tool('looks', 'Pick and apply a new look, when directions exist.'),
  tool('fix', 'Fix the findings, per the mode.'),
  tool('finish', 'End the audit.'),
  tool('skip_pages', 'Skip pages the owner asked to skip.', {
    paths: { type: 'array', items: { type: 'string' } },
  }),
  tool('stop_exploring', 'The owner wants no more exploring.'),
  tool('new_look', 'The owner wants a new look.', {
    wish: { type: 'string', description: 'Their wish, in their words.' },
  }),
  tool('revise_looks', 'A new round of directions from what the owner said about them.', {
    wish: { type: 'string', description: 'What they said about the looks, in their words.' },
  }),
  tool('dismiss', 'The owner says what they point at is not a problem.', {
    ref: { type: 'string' },
  }),
  tool('retry_fix', 'Try a rolled-back fix again, once, with a hint for the fixer.', {
    findingId: { type: 'string', description: 'The finding, from `changes`.' },
    hint: { type: 'string', description: 'What to do differently this time, or empty.' },
  }),
];

const NAMES = new Set<string>(TOOLS.map((t) => t.name));

/** Parses one tool call into a Decision; throws on anything else (the run falls back). */
export function parseDecision(name: string, args: string): Decision {
  if (!NAMES.has(name)) throw new Error(`unknown ability ${name}`);
  const a = JSON.parse(args || '{}') as {
    route?: string;
    say?: string;
    paths?: string[];
    wish?: string;
    ref?: string;
    findingId?: string;
    hint?: string;
  };
  return {
    ability: name as AbilityName,
    ...(a.route?.trim() ? { route: a.route.trim() } : {}),
    ...(a.say?.trim() ? { say: a.say.trim().slice(0, 240) } : {}),
    ...(a.paths?.length ? { paths: a.paths.slice(0, 20) } : {}),
    ...(a.wish?.trim() ? { wish: a.wish.trim().slice(0, 300) } : {}),
    ...(a.ref?.trim() ? { ref: a.ref.trim() } : {}),
    ...(a.findingId?.trim() ? { findingId: a.findingId.trim() } : {}),
    ...(a.hint?.trim() ? { hint: a.hint.trim().slice(0, 300) } : {}),
  };
}

export class SparkDecider implements Decider {
  constructor(
    private readonly caller: LlmCaller,
    private readonly ctx: () => CallContext,
    private readonly model: () => string,
  ) {}

  async next(situation: Situation, signal?: AbortSignal): Promise<Decision> {
    const res = await this.caller.call(this.ctx(), {
      task: 'crawl',
      model: this.model(),
      instructions: decidePrompt,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `<situation>${JSON.stringify(situation)}</situation>`,
            },
          ],
        },
      ],
      tools: TOOLS,
      reasoning: { effort: 'minimal' },
      fixture: 'decide',
      ...(signal ? { signal } : {}),
    });
    const call = res.output.find((o) => o.type === 'function_call');
    if (!call) throw new Error('no decision');
    return parseDecision(
      typeof call['name'] === 'string' ? call['name'] : '',
      typeof call['arguments'] === 'string' ? call['arguments'] : '{}',
    );
  }
}

/** What `converse` knows when it answers (§1.3). */
export interface ConverseInput {
  brief: Record<string, unknown>;
  live: boolean;
  /** What Fitts is doing right now, in words. */
  now: string;
  covered: { pages: number; controls: { done: number; total: number } };
  findings: string[];
  /** The last few lines of the chat, oldest first ("Fitts: …", "Owner: …"). */
  recent: string[];
  message: string;
  pointingAt?: string;
  /** What the owner wants to be called. */
  name?: string;
  /** Where the new look stands, as fact: nothing applied unless this says so. */
  look?: string;
}

export type Converse = (input: ConverseInput, signal?: AbortSignal) => Promise<string>;

const REPLY_FORMAT = {
  type: 'json_schema',
  name: 'reply',
  strict: true,
  schema: {
    type: 'object',
    properties: { say: { type: 'string' } },
    required: ['say'],
    additionalProperties: false,
  },
};

export function sparkConverse(
  caller: LlmCaller,
  ctx: () => CallContext,
  model: () => string,
): Converse {
  return async (input, signal) => {
    const res = await caller.call(ctx(), {
      task: 'interview',
      model: model(),
      instructions: conversePrompt,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: `<context>${JSON.stringify(input)}</context>` }],
        },
      ],
      format: REPLY_FORMAT,
      reasoning: { effort: 'minimal' },
      fixture: 'converse',
      ...(signal ? { signal } : {}),
    });
    const text = (JSON.parse(res.outputText || '{}') as { say?: string }).say?.trim() ?? '';
    if (!text) throw new Error('no reply');
    return text.slice(0, 600);
  };
}
