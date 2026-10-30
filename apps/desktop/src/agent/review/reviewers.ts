// The reviewer panel (SPEC-phase2 §8.1): five personas look at one route's evidence in parallel
// and return finding drafts. A draft must cite at least one evidence id it was given, or it is
// dropped; refs it names must be on the page.
import {
  FINDING_DRAFTS_FORMAT,
  type Brief,
  type FindingDraft,
  type Heuristic,
  type Lens,
  type ProbeResult,
} from '@fitts/schema';
import type { CallContext, LlmCaller } from '../llm/call';
import type { ModelChoice } from '../llm/router';
import type { AxSnapshot } from '../protocol';
import { PERSONAS } from './personas';

/** What the panel sees for one route. */
export interface RouteEvidence {
  route: string;
  /** The page when Fitts first saw it. */
  shot?: { jpegBase64: string };
  /** The same page on a phone (Fitts's phone pass), when it has one. */
  phoneShot?: { jpegBase64: string; label: string };
  snapshot: AxSnapshot;
  /** What Fitts did there, in order ("typed in Message", "tapped NEXT → /compose/confirm"). */
  trace: string[];
  probes: ProbeResult[];
}

export interface PersonaReview {
  route: string;
  persona: string;
  drafts: FindingDraft[];
}

export const shotId = (route: string) => `${route}#shot`;
export const snapshotId = (route: string) => `${route}#snapshot`;
export const traceId = (route: string) => `${route}#trace`;

const HEURISTICS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10']);
const LENSES = new Set([
  'usability',
  'accessibility',
  'performance',
  'look-and-feel',
  'ergonomics',
  'content',
]);

/** The text part of a reviewer's input (the screenshot goes alongside as an image). */
export function reviewInput(ev: RouteEvidence, brief: Brief): string {
  const probes = ev.probes.map((p) => ({
    evidenceId: p.evidenceId,
    probe: p.probe,
    pass: p.pass,
    ...(p.summary ? { summary: p.summary } : {}),
    items: p.items
      .slice(0, 6)
      .map((i) => ({ ref: i.ref, measured: i.measured, expected: i.expected })),
  }));
  const page = {
    path: ev.snapshot.path,
    title: ev.snapshot.title,
    headings: ev.snapshot.headings,
    controls: ev.snapshot.nodes.slice(0, 80).map((n) => ({
      ref: n.ref,
      role: n.role,
      name: n.name,
      ...(n.value ? { value: n.value } : {}),
      ...(n.href ? { href: n.href } : {}),
    })),
  };
  return [
    `Brief: ${JSON.stringify(brief)}`,
    `Route: ${ev.route}`,
    `Evidence ids you may cite: ${validIds(ev).join(', ')}`,
    `Probes: ${JSON.stringify(probes)}`,
    `What Fitts did here (${traceId(ev.route)}): ${ev.trace.slice(-20).join(' | ') || 'only looked'}`,
    `Page (${snapshotId(ev.route)}): <untrusted_page_content>${JSON.stringify(page)}</untrusted_page_content>`,
  ].join('\n');
}

export function validIds(ev: RouteEvidence): string[] {
  return [
    ...(ev.shot ? [shotId(ev.route)] : []),
    snapshotId(ev.route),
    ...(ev.trace.length ? [traceId(ev.route)] : []),
    ...ev.probes.map((p) => p.evidenceId),
  ];
}

/** Keeps drafts that cite real evidence, with values the schema allows. */
export function cleanDrafts(raw: unknown, ev: RouteEvidence): FindingDraft[] {
  const ids = new Set(validIds(ev));
  const refs = new Set([
    ...ev.snapshot.nodes.map((n) => n.ref),
    ...ev.probes.flatMap((p) => p.items.map((i) => i.ref)),
  ]);
  const list = (raw as { findings?: unknown[] } | null)?.findings;
  if (!Array.isArray(list)) return [];
  const out: FindingDraft[] = [];
  for (const d of list as Partial<FindingDraft>[]) {
    const evidenceIds = (d.evidenceIds ?? []).filter((id) => ids.has(id));
    if (!d.title || evidenceIds.length === 0) continue;
    out.push({
      title: String(d.title).slice(0, 80),
      finding: String(d.finding ?? '').slice(0, 400),
      fix: String(d.fix ?? '').slice(0, 300),
      heuristic: HEURISTICS.has(String(d.heuristic)) ? (d.heuristic as Heuristic) : null,
      lens: LENSES.has(String(d.lens)) ? (d.lens as Lens) : 'usability',
      severity: Math.min(4, Math.max(1, Math.round(Number(d.severity) || 2))),
      elementRef: d.elementRef && refs.has(d.elementRef) ? d.elementRef : null,
      evidenceIds,
      evidence: (d.evidence ?? []).map((e) => String(e).slice(0, 160)).slice(0, 3),
    });
  }
  return out;
}

export class ReviewerPanel {
  constructor(
    private readonly caller: LlmCaller,
    private readonly ctx: () => CallContext,
    /** One model per persona, from the router (the profile can change mid-run). */
    private readonly roster: () => ModelChoice[],
  ) {}

  /** All five personas on one route, in parallel. A persona that fails returns nothing. */
  async review(ev: RouteEvidence, brief: Brief, signal?: AbortSignal): Promise<PersonaReview[]> {
    const text = reviewInput(ev, brief);
    const roster = this.roster();
    return Promise.all(
      PERSONAS.map(async (persona, i) => {
        const choice = roster[i] ?? roster[0];
        try {
          if (!choice) throw new Error('no reviewer model');
          const res = await this.caller.call(this.ctx(), {
            task: 'review',
            model: choice.model,
            provider: choice.provider,
            instructions: persona.instructions,
            input: [
              {
                role: 'user',
                content: [
                  { type: 'input_text', text },
                  ...(ev.shot
                    ? [
                        {
                          type: 'input_image',
                          image_url: `data:image/jpeg;base64,${ev.shot.jpegBase64}`,
                        },
                      ]
                    : []),
                  ...(ev.phoneShot
                    ? [
                        { type: 'input_text', text: `The same page on ${ev.phoneShot.label}:` },
                        {
                          type: 'input_image',
                          image_url: `data:image/jpeg;base64,${ev.phoneShot.jpegBase64}`,
                        },
                      ]
                    : []),
                ],
              },
            ],
            format: FINDING_DRAFTS_FORMAT,
            reasoning: { effort: 'low' },
            maxOutputTokens: 6000,
            fixture: `review-${persona.id}`,
            ...(signal ? { signal } : {}),
          });
          return {
            route: ev.route,
            persona: persona.name,
            drafts: cleanDrafts(parseJson(res.outputText), ev),
          };
        } catch (e) {
          if ((e as { name?: string }).name === 'AbortError') throw e;
          return { route: ev.route, persona: persona.name, drafts: [] };
        }
      }),
    );
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}
