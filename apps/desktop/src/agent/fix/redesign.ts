// Applying a look-and-feel direction (SPEC-phase2 §8.3): one redesign job in its own worktree.
// The redesigner is the fixer's tool loop with room to restyle a whole site: it can list folders
// and write whole files, and it notes each wording change so the user can undo it on its own.
// Verification loads every crawled page on the worktree's server: each must render, and no new
// problem at severity 2 or higher may appear anywhere.
import type { Brief, Finding, ProbeResult } from '@fitts/schema';
import prompt from '../../../../../docs/prompts/redesign.md?raw';
import type { CallContext, LlmCaller } from '../llm/call';
import type { VerifyPagesResult } from '../protocol';
import { problems, type Check } from '../review/aggregate';
import type { Direction } from '../review/themefit';
import { fileHandlers, runToolLoop, TOOLS, type FixTools } from './fixer';

export const MAX_REDESIGN_STEPS = 48;

export interface RedesignTools extends FixTools {
  list(dir: string): Promise<string[]>;
  write(path: string, content: string): Promise<{ ok: boolean; error?: string }>;
}

/** A wording change the redesigner made, so it can be undone on its own. */
export interface WordingChange {
  path: string;
  from: string;
  to: string;
}

const fn = (name: string, description: string, props: Record<string, string>) => ({
  type: 'function',
  name,
  description,
  parameters: {
    type: 'object',
    properties: Object.fromEntries(Object.keys(props).map((k) => [k, { type: 'string' }])),
    required: Object.keys(props),
    additionalProperties: false,
  },
  strict: true,
});

const REDESIGN_TOOLS = [
  ...TOOLS.filter((t) => t.name !== 'done'),
  fn('list_files', 'List a folder (relative to the project root; "" for the root).', {
    dir: '',
  }),
  fn(
    'write_file',
    'Create a file, or replace a whole file, with the given content (source files only).',
    { path: '', content: '' },
  ),
  fn(
    'note_wording',
    'Record a wording change you already made: the file, the exact old text and the new text.',
    { path: '', from: '', to: '' },
  ),
  fn('done', 'Finish: one or two sentences on what you changed (or why you could not).', {
    summary: '',
  }),
];

/** The task (§8.3): the brief, why the look doesn't fit, the direction and the pages. */
export function redesignTask(input: {
  brief: Brief;
  why: string;
  direction: Direction;
  routes: string[];
  retryReason?: string;
  adjust?: string;
}): string {
  const d = input.direction;
  return [
    `# Redesign: ${d.name}`,
    '',
    `Brief: ${JSON.stringify(input.brief)}`,
    `Why the current look doesn't fit: ${input.why}`,
    '',
    `Direction "${d.name}"`,
    `- Swatches: ${d.swatches.join(', ')}`,
    `- Typeface: ${d.typeface || 'your choice, to suit the notes'}`,
    `- Notes: ${d.notes}`,
    '',
    `Pages (every one must still work): ${input.routes.join(', ')}`,
    'Verification it must pass: every page renders on the dev server, and no new problems at severity 2 or higher (contrast, tap targets, labels, focus, sideways scrolling at 360/768/1280px).',
    ...(input.retryReason
      ? [
          '',
          `Your redesign is already in this worktree, but it failed verification: ${input.retryReason}. Fix that without undoing the new look.`,
        ]
      : []),
    ...(input.adjust
      ? [
          '',
          `The redesign is already in this worktree. The user asked for an adjustment: "${input.adjust}". Change only what that asks.`,
        ]
      : []),
  ].join('\n');
}

/** Runs the redesigner. `images` are data URLs: the direction's mockup, then current pages. */
export async function runRedesigner(
  caller: LlmCaller,
  ctx: CallContext,
  model: string,
  task: string,
  tools: RedesignTools,
  opts: { images: string[]; signal?: AbortSignal; onStep?: (line: string) => void },
): Promise<{ patched: number; summary: string; wording: WordingChange[] }> {
  const wording: WordingChange[] = [];
  const handlers = {
    ...fileHandlers(tools, opts.onStep),
    list_files: async (args: Record<string, string>) => {
      opts.onStep?.(`Looking in ${args['dir'] || 'the project'}`);
      return { output: (await tools.list(args['dir'] ?? '')).join('\n') || '(empty)' };
    },
    write_file: async (args: Record<string, string>) => {
      opts.onStep?.(`Writing ${args['path'] ?? ''}`);
      const r = await tools.write(args['path'] ?? '', args['content'] ?? '');
      return { output: r.ok ? 'written' : `error: ${r.error ?? 'failed'}`, patched: r.ok };
    },
    note_wording: (args: Record<string, string>) => {
      const change = { path: args['path'] ?? '', from: args['from'] ?? '', to: args['to'] ?? '' };
      if (change.path && change.from && change.to && change.from !== change.to)
        wording.push(change);
      return Promise.resolve({ output: 'noted' });
    },
  };
  const out = await runToolLoop(caller, ctx, {
    model,
    instructions: prompt,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: task },
          ...opts.images.slice(0, 4).map((url) => ({ type: 'input_image', image_url: url })),
        ],
      },
    ],
    tools: REDESIGN_TOOLS,
    handlers,
    maxSteps: MAX_REDESIGN_STEPS,
    effort: 'medium',
    maxOutputTokens: 32000,
    findingId: 'redesign',
    fixture: 'redesign',
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  return { ...out, wording };
}

/** A page's problems after the redesign, as `probe|title` keys with their impact. */
function pageProblems(page: VerifyPagesResult['pages'][number]): Map<string, number> {
  const now = new Map<string, number>();
  for (const r of page.results)
    for (const [k, v] of problems(r.probe, r.pass ? [] : r.items)) now.set(k, v);
  for (const [k, v] of problems('focus-visible', page.focus)) now.set(k, v);
  for (const [k, v] of problems('viewport-sweep', page.viewport)) now.set(k, v);
  return now;
}

/** §8.3: pass = every page rendered and no page has a new problem at severity 2 or higher. */
export function judgeRedesign(
  after: VerifyPagesResult,
  baseline: (route: string) => ProbeResult[],
): string | null {
  if (!after.ok) return after.error ?? 'verification didn’t run';
  const broken = after.pages.filter((p) => !p.loaded).map((p) => p.route);
  if (broken.length) return `${broken.join(', ')} didn’t render`;
  const fresh: string[] = [];
  for (const page of after.pages) {
    const before = new Set<string>();
    for (const r of baseline(page.route))
      for (const k of problems(r.probe, r.pass ? [] : r.items).keys()) before.add(k);
    for (const [k, v] of pageProblems(page))
      if (!before.has(k) && v >= 2) fresh.push(`${k.split('|')[1] ?? k} on ${page.route}`);
  }
  return fresh.length ? `it caused new problems: ${fresh.slice(0, 4).join('; ')}` : null;
}

/** Open findings whose check no longer reports its problem on the redesigned page. */
export function fixedByRedesign(
  after: VerifyPagesResult,
  findings: Finding[],
  checks: Map<string, Check>,
): string[] {
  const byRoute = new Map(after.pages.map((p) => [p.route, pageProblems(p)]));
  return findings
    .filter((f) => f.status === 'open' || f.status === 'fixing')
    .filter((f) => {
      const check = checks.get(f.id);
      if (!check || check.probe === 'links') return false;
      const now = byRoute.get(check.routes[0] ?? f.route);
      return now !== undefined && !now.has(`${check.probe}|${check.title}`);
    })
    .map((f) => f.id);
}

/** The redesign PR's body (§9.3): why, the direction, what was checked, and what it fixed. */
export function redesignPrBody(input: {
  why: string;
  direction: Direction;
  summary: string;
  routes: string[];
  wording: WordingChange[];
  fixed: Finding[];
}): string {
  const d = input.direction;
  return [
    `**Look and feel** · redesign: ${d.name}`,
    '',
    '## Why',
    input.why,
    '',
    '## Direction',
    `${d.notes} Swatches ${d.swatches.join(', ')}; typeface ${d.typeface || 'system'}.`,
    '',
    '## What changed',
    input.summary || 'Restyled every page to the direction.',
    ...(input.wording.length
      ? ['', '## Wording', ...input.wording.map((w) => `- "${w.from}" → "${w.to}"`)]
      : []),
    ...(input.fixed.length
      ? ['', '## Also fixed', ...input.fixed.map((f) => `- ${f.title} (${f.route})`)]
      : []),
    '',
    '## Verification',
    `Loaded every page on this branch's dev server (${input.routes.join(', ')}): each one renders, and no new problems at severity 2 or higher appeared (all page probes, focus, and 360, 768 and 1280px).`,
  ].join('\n');
}
