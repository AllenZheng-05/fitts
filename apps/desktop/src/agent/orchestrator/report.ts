// The owner reports an issue (SPEC-phase4 §4.2): "this is a problem", pointing or not. One
// small Spark call turns their words into a finding draft; without a model the words become
// the finding as they are. Owner findings are always shown and never argued down.
import type { Finding, Heuristic, Lens, Severity } from '@fitts/schema';
import prompt from '../../../../../docs/prompts/report-issue.md?raw';
import type { CallContext, LlmCaller } from '../llm/call';

export interface ReportInput {
  text: string;
  route: string;
  element?: { ref: string; role: string; name: string };
  brief: Record<string, unknown>;
}

export interface ReportDraft {
  title: string;
  finding: string;
  fix: string;
  heuristic?: Heuristic;
  lens: Lens;
  severity: Severity;
}

const HEURISTICS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10']);
const LENSES = new Set([
  'usability',
  'accessibility',
  'performance',
  'look-and-feel',
  'ergonomics',
  'content',
]);

export const REPORT_FORMAT = {
  type: 'json_schema',
  name: 'owner_finding',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      finding: { type: 'string' },
      fix: { type: 'string' },
      heuristic: {
        type: ['string', 'null'],
        enum: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', null],
      },
      lens: { type: 'string', enum: [...LENSES] },
      severity: { type: 'integer' },
    },
    required: ['title', 'finding', 'fix', 'heuristic', 'lens', 'severity'],
    additionalProperties: false,
  },
};

/** Severity from the owner's own words (the default is 3: they said it's a problem). */
export function severityFromWords(text: string): Severity {
  if (/\b(can'?t|cannot|blocks?|blocked|broken|never works|impossible|unusable)\b/i.test(text))
    return 4;
  if (/\b(minor|a bit|slightly|cosmetic|small|nit|tiny)\b/i.test(text)) return 2;
  return 3;
}

/** The draft without a model: the owner's words, trimmed into the form. */
export function plainDraft(input: ReportInput): ReportDraft {
  const words = input.text.replace(/\s+/g, ' ').trim();
  const title =
    words
      .split(' ')
      .slice(0, 9)
      .join(' ')
      .replace(/[.,;:!?]+$/, '') || 'Something the owner flagged';
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    finding: `You said: “${words.slice(0, 300)}”${input.element ? ` (about the ${input.element.role} “${input.element.name}”)` : ''}.`,
    fix: '',
    lens: 'usability',
    severity: severityFromWords(words),
  };
}

/** Checks a model's draft; falls back to the plain one for anything unusable. */
export function parseDraft(raw: unknown, input: ReportInput): ReportDraft {
  const d = (raw ?? {}) as Partial<Record<keyof ReportDraft, unknown>>;
  const plain = plainDraft(input);
  const title = typeof d.title === 'string' ? d.title.trim().slice(0, 80) : '';
  const sev = Number(d.severity);
  return {
    title: title || plain.title,
    finding: (typeof d.finding === 'string' && d.finding.trim().slice(0, 400)) || plain.finding,
    fix: typeof d.fix === 'string' ? d.fix.trim().slice(0, 300) : '',
    ...(HEURISTICS.has(String(d.heuristic)) ? { heuristic: d.heuristic as Heuristic } : {}),
    lens: LENSES.has(String(d.lens)) ? (d.lens as Lens) : 'usability',
    severity: sev >= 1 && sev <= 4 ? (Math.round(sev) as Severity) : plain.severity,
  };
}

/** One Spark call; the plain draft when it fails. */
export async function draftReport(
  caller: LlmCaller,
  ctx: CallContext,
  model: string,
  input: ReportInput,
  signal?: AbortSignal,
): Promise<ReportDraft> {
  try {
    const res = await caller.call(ctx, {
      task: 'review',
      model,
      instructions: prompt,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Brief: ${JSON.stringify(input.brief)}\nPage: ${input.route}\n${input.element ? `Element: <untrusted_page_content>${JSON.stringify(input.element)}</untrusted_page_content>\n` : ''}<owner_words>${input.text.slice(0, 1500)}</owner_words>`,
            },
          ],
        },
      ],
      format: REPORT_FORMAT,
      reasoning: { effort: 'minimal' },
      fixture: 'report-issue',
      ...(signal ? { signal } : {}),
    });
    return parseDraft(JSON.parse(res.outputText), input);
  } catch {
    return plainDraft(input);
  }
}

/** The finding an owner's report becomes: shown, theirs, never a suggestion. */
export function ownerFinding(
  id: string,
  runId: string,
  draft: ReportDraft,
  input: ReportInput,
  at: { stepIndex: number; atMs: number },
): Finding {
  return {
    id,
    runId,
    severity: draft.severity,
    ...(draft.heuristic ? { heuristic: draft.heuristic } : {}),
    lens: draft.lens,
    title: draft.title,
    finding: draft.finding,
    fix: draft.fix,
    route: input.route,
    agreement: { agreeing: 1, total: 1, who: ['You'] },
    evidence: [`You said: “${input.text.replace(/\s+/g, ' ').trim().slice(0, 160)}”`],
    ...(input.element ? { elementRef: input.element.ref } : {}),
    stepIndex: at.stepIndex,
    atMs: at.atMs,
    status: 'open',
    lane: 'shown',
    owner: true,
  };
}
