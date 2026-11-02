// The surprise judge (SPEC-phase4 §6B.5, restored Nov 2): for a popped-up, jumped or
// scrolled-by-itself event, Muse Wonder looks at the frames around the moment (labeled by time),
// the last action and the brief, and says whether a person would expect it. Unexpected → a
// finding draft that cites the event (measured evidence) and counts as one reviewer. An answer
// that can't be read, twice, is a note, never a finding (§6C).
import judgePrompt from '../../../../../docs/prompts/judge-surprise.md?raw';
import type { Brief, FindingDraft, Heuristic } from '@fitts/schema';
import type { SurpriseNote } from '@fitts/probes';
import { retryUnusable, UnusableAnswer, type CallContext, type LlmCaller } from '../llm/call';

/** Judged events per run. */
export const JUDGE_CAP = 12;
/** The persona name the aggregator counts the judge's vote under. */
export const JUDGE_PERSONA = 'Judge';
/** The kinds the judge looks at (focus moves and the WCAG kinds are probe findings or notes). */
export const JUDGED = new Set<SurpriseNote['kind']>(['popped-up', 'jumped', 'scrolled-by-itself']);

export interface JudgeFrame {
  /** Ms relative to the event (negative: before). */
  t: number;
  jpegBase64: string;
}

export interface JudgeInput {
  note: Pick<SurpriseNote, 'kind' | 'measured'>;
  route: string;
  frames: JudgeFrame[];
  /** "Clicked “Send”" — what the person did last, or nothing yet. */
  lastAction?: string;
  brief?: Brief;
}

export interface JudgeVerdict {
  expected: boolean;
  why: string;
  severity: number;
  heuristic: Heuristic | null;
}

const HEURISTICS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10']);

export const JUDGE_FORMAT = {
  type: 'json_schema',
  name: 'surprise_judgement',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      expected: { type: 'boolean' },
      why: { type: 'string' },
      severity: { type: 'integer', minimum: 0, maximum: 4 },
      heuristic: { type: ['string', 'null'], enum: [...HEURISTICS, null] },
    },
    required: ['expected', 'why', 'severity', 'heuristic'],
    additionalProperties: false,
  },
};

const secs = (ms: number) => `${ms >= 0 ? '+' : '−'}${(Math.abs(ms) / 1000).toFixed(1)} s`;

/** The judge's text: what changed, what the person did, what the site is for. */
export function judgeText(input: JudgeInput): string {
  const brief =
    input.brief?.summary ?? [input.brief?.for, input.brief?.who].filter(Boolean).join(', ');
  return [
    '<untrusted_page_data>',
    `Page: ${input.route}`,
    `What changed (measured): ${input.note.measured}`,
    `What the person did just before: ${input.lastAction ?? 'nothing yet (the page had just loaded)'}`,
    ...(brief ? [`What the site is for: ${brief}`] : []),
    `Frames, by time from the change: ${input.frames.map((f) => secs(f.t)).join(', ')}`,
    '</untrusted_page_data>',
  ].join('\n');
}

/** Asks the judge; null when the answer can't be read twice (a note, never a finding). */
export async function judgeSurprise(
  caller: LlmCaller,
  ctx: CallContext,
  model: string,
  input: JudgeInput,
  signal?: AbortSignal,
): Promise<JudgeVerdict | null> {
  const ask = async (): Promise<JudgeVerdict> => {
    const res = await caller.call(ctx, {
      task: 'review',
      model,
      instructions: judgePrompt,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: judgeText(input) },
            ...input.frames.flatMap((f) => [
              { type: 'input_text', text: `Frame at ${secs(f.t)}:` },
              { type: 'input_image', image_url: `data:image/jpeg;base64,${f.jpegBase64}` },
            ]),
          ],
        },
      ],
      format: JUDGE_FORMAT,
      reasoning: { effort: 'low' },
      fixture: 'judge-surprise',
      ...(signal ? { signal } : {}),
    });
    let out: Partial<JudgeVerdict>;
    try {
      out = JSON.parse(res.outputText) as Partial<JudgeVerdict>;
    } catch {
      throw new UnusableAnswer('not JSON');
    }
    if (typeof out.expected !== 'boolean') throw new UnusableAnswer('no verdict');
    const heuristic =
      typeof out.heuristic === 'string' && HEURISTICS.has(out.heuristic) ? out.heuristic : null;
    return {
      expected: out.expected,
      why: typeof out.why === 'string' ? out.why.slice(0, 300) : '',
      severity: Math.max(out.expected ? 0 : 1, Math.min(4, Math.round(Number(out.severity) || 0))),
      heuristic,
    };
  };
  try {
    return await retryUnusable(ask);
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') throw e;
    return null;
  }
}

const TITLES: Record<string, string> = {
  'popped-up': 'Something pops up without being asked',
  jumped: 'The page jumps while you use it',
  'scrolled-by-itself': 'The page scrolls by itself',
};

/** An unexpected verdict as the judge's finding draft, citing the event as its evidence. */
export function judgeDraft(
  note: Pick<SurpriseNote, 'kind' | 'measured' | 'ref'>,
  verdict: JudgeVerdict,
  evidenceId: string,
): FindingDraft {
  return {
    title: TITLES[note.kind] ?? 'Something changes without being asked',
    finding: `${verdict.why || note.measured}`.trim(),
    fix:
      note.kind === 'jumped'
        ? 'Reserve the space before the content arrives, so nothing moves under the pointer.'
        : note.kind === 'scrolled-by-itself'
          ? 'Leave the scroll position to the person; don’t move it without their input.'
          : 'Show it only when the person asks, or in a place that doesn’t cover what they’re doing.',
    heuristic: verdict.heuristic ?? 'H3',
    lens: 'usability',
    severity: verdict.severity,
    elementRef: note.ref || null,
    evidenceIds: [evidenceId],
    evidence: [note.measured],
    expected: 'The page stays as the person left it until they ask for a change.',
    actual: note.measured,
  };
}
