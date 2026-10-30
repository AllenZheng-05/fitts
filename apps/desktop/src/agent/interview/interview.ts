// The real interview (SPEC-phase2 §6.2): one structured model turn per answer. The model sees
// the conversation, the brief so far, the screen the user is on and the path they clicked; it
// returns Fitts's next line and the brief fields the answer filled, as summaries.
import type { Brief, RunState } from '@fitts/schema';
import prompt from '../../../../../docs/prompts/interview.md?raw';
import type { CallContext, LlmCaller } from '../llm/call';

export const MAX_QUESTIONS = 6;

const field = { type: ['string', 'null'] };
const FIELDS = ['for', 'who', 'pain', 'feel', 'flows', 'outOfScope'] as const;

export const INTERVIEW_FORMAT = {
  type: 'json_schema',
  name: 'interview_turn',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      say: { type: 'string' },
      fields: {
        type: 'object',
        properties: Object.fromEntries(FIELDS.map((f) => [f, field])),
        required: [...FIELDS],
        additionalProperties: false,
      },
      quickReplies: { type: 'array', items: { type: 'string' } },
      ready: { type: 'boolean' },
    },
    required: ['say', 'fields', 'quickReplies', 'ready'],
    additionalProperties: false,
  },
};

export interface InterviewTurn {
  say: string;
  fields: Partial<Brief>;
  quickReplies: string[];
  ready: boolean;
}

export interface InterviewInput {
  state: RunState;
  /** The latest site frame (JPEG, base64). */
  shot?: string;
  /** Where the user is, and the paths they clicked through, oldest first. */
  page?: { path: string; title: string; headings: string[] };
  path: string[];
}

/** Checks the model's turn; throws when it isn't usable (the caller falls back to the script). */
export function parseTurn(text: string): InterviewTurn {
  const raw = JSON.parse(text) as Partial<{
    say: unknown;
    fields: Record<string, unknown>;
    quickReplies: unknown;
    ready: unknown;
  }>;
  const say = typeof raw.say === 'string' ? raw.say.trim() : '';
  if (!say) throw new Error('empty interview turn');
  const fields: Partial<Brief> = {};
  for (const f of FIELDS) {
    const v = raw.fields?.[f];
    if (typeof v === 'string' && v.trim()) fields[f] = v.trim().slice(0, 120);
  }
  const quickReplies = Array.isArray(raw.quickReplies)
    ? raw.quickReplies
        .filter((q): q is string => typeof q === 'string' && q.trim() !== '')
        .slice(0, 3)
    : [];
  return { say: say.slice(0, 400), fields, quickReplies, ready: raw.ready === true };
}

/** The conversation so far as Responses input, then this turn's context and screen. */
export function interviewInput({ state, shot, page, path }: InterviewInput): unknown[] {
  const history = state.chat.flatMap((c) =>
    c.type === 'fitts.message'
      ? [{ role: 'assistant', content: c.text }]
      : c.type === 'user.message'
        ? [{ role: 'user', content: c.text }]
        : [],
  );
  const asked = state.chat.filter((c) => c.type === 'fitts.message').length;
  const context = [
    `Brief so far: ${JSON.stringify(state.brief)}`,
    `Questions asked so far: ${asked} of ${MAX_QUESTIONS}${asked >= MAX_QUESTIONS ? ' (no more questions: wrap up)' : ''}`,
    page
      ? `On screen now: <untrusted_page_content>${JSON.stringify(page)}</untrusted_page_content>`
      : 'The site isn’t on screen.',
    `Path the user clicked: ${path.join(' → ') || 'none yet'}`,
  ].join('\n');
  return [
    ...history,
    {
      role: 'user',
      content: [
        { type: 'input_text', text: context },
        ...(shot ? [{ type: 'input_image', image_url: `data:image/jpeg;base64,${shot}` }] : []),
      ],
    },
  ];
}

export async function interviewTurn(
  caller: LlmCaller,
  ctx: CallContext,
  model: string,
  input: InterviewInput,
  signal?: AbortSignal,
): Promise<InterviewTurn> {
  const res = await caller.call(ctx, {
    task: 'interview',
    model,
    instructions: prompt,
    input: interviewInput(input),
    format: INTERVIEW_FORMAT,
    reasoning: { effort: 'minimal' },
    fixture: 'interview-turn',
    ...(signal ? { signal } : {}),
  });
  return parseTurn(res.outputText);
}
