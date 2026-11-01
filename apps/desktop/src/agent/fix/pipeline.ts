// The fix pipeline (SPEC-phase2 §9): one job at a time, every one on the run's one branch in
// the run's one worktree. Each job runs the fixer, then is verified on the worktree's own dev
// server: the finding's probe must stop reporting the problem, no new severity ≥2 problems may
// appear on that route, and the project's own tests and CI checks must still pass. A change that
// fails a check isn't thrown away: the fixer gets it back with the output, up to MAX_REPAIRS
// times. Only a change that passes is committed; otherwise the worktree goes back to the last
// good commit, with a reason. The run's one PR opens at the end (finalize). Undo reverts one
// commit on the branch (or opens a revert PR once the run's PR is merged); retry runs the job
// again.
import type {
  Brief,
  Change,
  ChatItem,
  Finding,
  Mode,
  ProbeName,
  ProbeResult,
  RunEvent,
  RunState,
} from '@fitts/schema';
import { PAGE_PROBES } from '@fitts/probes';
import { specFonts } from '@fitts/styles';
import type { AssetsResult, CiRun, TestRun, VerifyPagesResult, VerifyResult } from '../protocol';
import { problems, type Check } from '../review/aggregate';
import type { Direction } from '../review/themefit';
import type { Site } from '../site-client';
import { ciLine, fixBudget, repairBudget, taskFile, type FixTools, type LoopEnd } from './fixer';
import {
  fixedByRedesign,
  judgeRedesign,
  judgeStyle,
  redesignSection,
  redesignTask,
  type RedesignTools,
  type WordingChange,
} from './redesign';

/** Before any change: the project's tests and its CI checks, to compare a fix against. */
interface Baseline {
  tests: TestRun;
  ci: CiRun;
}

const NO_CI: CiRun = { ran: false, checks: [] };

/**
 * Why a change failed: `reason` is the one line the owner sees; `detail` is what the fixer gets
 * for its repair pass (every broken check with its output, the tests' output, the probe's items).
 */
export interface Verdict {
  reason: string;
  detail: string;
}

/** One job at a time (§9.2): fixes land on one branch, one after another. */
export const MAX_FIX_JOBS = 1;
/** A change that fails a check gets this many more passes before it's rolled back (§9.2). */
export const MAX_REPAIRS = 3;

/**
 * Probes a worktree's server can re-run on a page (§9.2). Findings from traces (network,
 * feedback timing, errors, back mid-flow, labels) need the flow replayed, which verification
 * doesn't do yet, so they aren't fixed automatically: no fix is "verified" without proof.
 */
const VERIFIABLE = new Set<ProbeName>([...PAGE_PROBES, 'focus-visible', 'viewport-sweep', 'links']);

/** What the pipeline needs from the run. */
export interface PipelineHost {
  state(): RunState;
  emit(events: RunEvent[]): void;
  say(text: string): void;
  id(): string;
  /** A blocking question (Go ahead / Skip it); true for Go ahead. */
  ask(text: string): Promise<boolean>;
  /** The run's own probe results for a route (the baseline for regressions). */
  baseline(route: string): ProbeResult[];
  costOf(findingId: string): number;
  /** Every job has settled (none running or queued). */
  idle(): void;
  /** What the run is doing once a redesign adjustment ends (acting, or idle when it's done). */
  restingActivity(): RunState['activity'];
  /**
   * The redesign's final review (SPEC-phase3 §2.4), before it joins the run's PR. `adjust`
   * changes the branch from the owner's words while the review is open. Without it, it just
   * stays.
   */
  review?(changeId: string, adjust: (text: string) => Promise<void>): Promise<'ok' | 'restart'>;
  /** A change settled: verified, or rolled back with its reason (the decider hears about it). */
  settled?(change: Change): void;
}

export type Fixer = (
  task: string,
  tools: FixTools,
  opts: {
    findingId: string;
    onStep: (line: string) => void;
    /** The step budget (fixBudget). */
    budget?: number;
    /** Never more steps than this (a repair pass gets no extension). */
    hardMax?: number;
    /** At the budget while still making progress: keep going? */
    more?: (steps: number) => Promise<boolean>;
  },
) => Promise<{ patched: number; summary: string; notes?: string; end?: LoopEnd }>;

export type Redesigner = (
  task: string,
  tools: RedesignTools,
  opts: { images: string[]; onStep: (line: string) => void },
) => Promise<{ patched: number; summary: string; wording: WordingChange[] }>;

/** What a redesign job needs from the run (§8.3). */
export interface RedesignRequest {
  brief: Brief;
  why: string;
  direction: Direction;
  /** Every crawled page, each checked on the redesigned branch. */
  routes: string[];
  /** The before shots' size, so the after shots match. */
  size?: { width: number; height: number };
  /** Data URLs for the redesigner: the direction's mockup, then current pages. */
  images: string[];
  /** Each route's before shot (an asset URL). */
  before: Record<string, string>;
  /** Saves a route's after shot and returns its asset URL. */
  saveShot(route: string, jpegBase64: string): Promise<string>;
  /** The direction's fonts and three.js once they're in the worktree (set by the job). */
  assets?: AssetsResult;
}

interface Pending {
  findingId: string;
  changeId?: string;
  retryReason?: string;
  /** The user's note for a retry. */
  hint?: string;
  /** The mode when the fix was started (a change since Autonomous asks before the PR). */
  mode: Mode;
}

/** "No change made…" → "no change made…" (a reason inside a sentence). */
const lowerFirst = (s: string) => s.replace(/^[A-Z](?![A-Z])/, (c) => c.toLowerCase());

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

const isAuto = (mode: Mode) => mode === 'autonomous' || mode === 'dangerous';

/** §9.2: pass = the check's problem is gone and nothing new at severity ≥ 2. */
export function judge(check: Check, after: VerifyResult, baseline: ProbeResult[]): string | null {
  if (!after.ok) return after.error ?? 'verification didn’t run';
  const now = new Map<string, number>();
  for (const r of after.results)
    for (const [k, v] of problems(r.probe, r.pass ? [] : r.items)) now.set(k, v);
  for (const [k, v] of problems('focus-visible', after.focus)) now.set(k, v);
  for (const [k, v] of problems('viewport-sweep', after.viewport)) now.set(k, v);
  if (check.probe === 'links') {
    const broken = check.hrefs.filter((h) => !(after.links[h] && (after.links[h] ?? 0) < 400));
    if (broken.length) return `${broken.join(', ')} still doesn’t load`;
  } else if (now.has(`${check.probe}|${check.title}`))
    return `the ${check.probe} probe still reports “${check.title}”`;
  const before = new Set<string>();
  for (const r of baseline)
    for (const k of problems(r.probe, r.pass ? [] : r.items).keys()) before.add(k);
  const fresh = [...now].filter(([k, v]) => !before.has(k) && v >= 2).map(([k]) => k.split('|')[1]);
  return fresh.length ? `it caused a new problem: ${fresh.join(', ')}` : null;
}

/** A failed verification with what the probes still report, for the fixer's repair pass. */
function probeVerdict(reason: string, after: VerifyResult): Verdict {
  const lines: string[] = [];
  for (const r of after.results)
    if (!r.pass)
      for (const i of r.items.slice(0, 6))
        lines.push(
          `- ${r.probe}: ${i.ref || i.selector}: ${i.measured}${i.expected ? ` (expected ${i.expected})` : ''}`,
        );
  for (const i of after.focus.slice(0, 4)) lines.push(`- focus-visible: ${i.ref}: ${i.measured}`);
  for (const i of after.viewport.slice(0, 4))
    lines.push(`- viewport-sweep: ${i.ref}: ${i.measured}`);
  return { reason, detail: [reason, ...lines.slice(0, 12)].join('\n') };
}

/** A fix's section of the run's PR (§9.3): heuristic and severity, problem, fix, evidence, repro. */
export function fixSection(f: Finding, check: Check | undefined, summary: string): string {
  return [
    `## ${f.title}`,
    '',
    `**${f.heuristic ?? f.lens}** · severity ${f.severity}`,
    '',
    `### Problem`,
    f.finding,
    '',
    `### Fix`,
    summary || f.fix,
    '',
    `### Evidence`,
    ...f.evidence.map((e) => `- ${e}`),
    '',
    `### Checked`,
    check
      ? `Re-ran the ${check.probe} probe on ${check.routes[0] ?? f.route} against this branch's dev server: “${check.title}” is gone, and no new problems at severity 2 or higher appeared (360, 768 and 1280px).`
      : 'Re-checked by the reviewer panel.',
    '',
    `### Repro`,
    `Open ${f.route}${f.elementRef ? ` and find the element \`${f.elementRef}\`` : ''}.`,
  ].join('\n');
}

/** The run's PR title: "Fitts: 3 fixes", "Redesign: Quiet stone and 2 fixes". */
export function runPrTitle(changes: Change[]): string {
  const redesign = changes.find((c) => c.kind === 'redesign');
  const fixes = changes.filter((c) => c.kind === 'fix').length;
  const n = `${fixes} ${fixes === 1 ? 'fix' : 'fixes'}`;
  if (redesign) return fixes ? `${redesign.title} and ${n}` : redesign.title;
  return `Fitts: ${n}`;
}

/**
 * The run's PR body (§9.3): one section per change, in order, then how the branch was checked.
 * No AI attribution footer.
 */
export function runPrBody(
  sections: string[],
  verification: { tested: boolean; ci: string[]; redesigned: boolean },
): string {
  return [
    ...sections.flatMap((s) => [s, '']),
    '## Verification',
    `Each change was checked on this branch's dev server before it was committed${
      verification.redesigned ? ' (the redesign on every page)' : ''
    }.${verification.tested ? ' Your test suite passes on this branch.' : ''}${ciLine(verification.ci)}`,
  ].join('\n');
}

/** "+ line" / "- line" from a unified diff, for `finding.diff` (the Finding panel's code view). */
export function diffOf(text: string): NonNullable<Finding['diff']> {
  const files = [...text.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1] ?? '');
  const lines = text
    .split('\n')
    .filter(
      (l) =>
        (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'),
    )
    .slice(0, 40)
    .map((l) => ({
      kind: l.startsWith('+') ? ('add' as const) : ('del' as const),
      text: l.slice(1),
    }));
  return { files, lines };
}

export class FixPipeline {
  private readonly queue: Pending[] = [];
  private running = 0;
  /** The run's one worktree and branch (§9.2), made by the first job. */
  private run: { job: string; branch: string } | undefined;
  /** The branch's last commit every check passed on: a failed change resets to it. */
  private lastGood = '';
  /** The project's own tests and CI checks before any change, once per run. */
  private baseline: Promise<Baseline> | undefined;
  /** The run's one PR (§9.3), once finalize opened it. */
  private runPr: { number: number; url: string } | undefined;
  /** The project's tests passed on the branch after a change (the PR says so). */
  private tested = false;
  /** The CI checks that passed on the branch after a change, by name (the PR says so). */
  private ciPassed: string[] = [];
  /** Each change's section of the PR body, by change id. */
  private readonly sections = new Map<string, string>();
  /** How many fixer passes each finding has had this run (the first, plus repairs). */
  private readonly attempts = new Map<string, number>();
  /** The modes jobs were started in (a job started in Autonomous asks before the PR if that changed). */
  private readonly startedIn = new Set<Mode>();
  /** A redesign runs alone and first (§9.2): fix jobs wait while it does. */
  private redesigning = false;
  private redesignJob: { changeId: string; request: RedesignRequest } | undefined;
  /** Each wording card's change, so "Undo this" can revert just that line. */
  private readonly wording = new Map<string, WordingChange & { changeId: string }>();
  /** What each finding's last attempt read and changed, so Try again starts from there. */
  private readonly lastNotes = new Map<string, string>();

  constructor(
    private readonly host: PipelineHost,
    private readonly site: Site,
    private readonly fixer: Fixer,
    private readonly checks: Map<string, Check>,
    private readonly redesigner?: Redesigner,
  ) {}

  /** Findings with a check Fitts can run (the others need a person to verify). */
  fixable(findingIds: string[]): string[] {
    return findingIds.filter((id) => {
      const check = this.checks.get(id);
      // A phone-only problem would "pass" at desktop size without a real fix.
      return check !== undefined && VERIFIABLE.has(check.probe) && !check.device;
    });
  }

  /** The run's branch, once a job has made it. */
  get branch(): string | undefined {
    return this.run?.branch;
  }

  /** The run's worktree on `fitts/run-<runId>`, made once; jobs are serial, so no race. */
  private async ensureRun(): Promise<{ job: string; branch: string }> {
    if (this.run) return this.run;
    const runId = this.host.state().runId;
    const prepared = (await this.site.fix({
      fn: 'prepare',
      runId,
      findingId: 'run',
      branch: `fitts/run-${slug(runId)}`,
    })) as { job: string; branch: string; sha?: string };
    this.run = { job: prepared.job, branch: prepared.branch };
    this.lastGood = prepared.sha ?? '';
    return this.run;
  }

  /**
   * The project's tests and CI checks before any change, on the fresh worktree: once per run.
   * Tests that can't run count as "nothing to compare against".
   */
  private baselineChecks(job: string): Promise<Baseline> {
    if (!this.baseline) {
      const tests = (this.site.fix({ fn: 'tests', job }) as Promise<TestRun>).catch(() => ({
        ran: false,
        ok: true,
        summary: '',
      }));
      const ci = (this.site.fix({ fn: 'ci', job }) as Promise<CiRun>).catch((): CiRun => ({
        ran: false,
        checks: [],
      }));
      // A host that can't run them answers oddly or not at all: that's "nothing to compare".
      this.baseline = Promise.all([tests, ci]).then(([t, c]) => ({
        tests: t && typeof t === 'object' ? t : { ran: false, ok: true, summary: '' },
        ci: c && typeof c === 'object' && Array.isArray(c.checks) ? c : NO_CI,
      }));
    }
    return this.baseline;
  }

  /** What the fixer is told about the project's checks: each one, and whether it passes today. */
  private checksFor(baseline: Baseline) {
    return {
      checks: baseline.ci.checks.map((c) => ({ name: c.name, passing: c.ok })),
      tests: baseline.tests.ran && baseline.tests.ok,
    };
  }

  /**
   * After a change that passed its probe check: does the project's own test suite still pass,
   * and do its CI checks (lint, formatting, types)? Only what passed before the change counts.
   */
  private async testsAfter(job: string, baseline: Baseline): Promise<Verdict | null> {
    // Tests that already failed (or never ran) before the change can't tell us anything.
    if (baseline.tests.ran && baseline.tests.ok) {
      this.host.emit([{ type: 'now.changed', nowText: 'Running your tests' }]);
      const after = (await this.site.fix({ fn: 'tests', job })) as TestRun;
      if (!after.ok) {
        const reason = `your tests fail with this change: ${after.summary.split('\n')[0] ?? 'see the test output'}`;
        return { reason, detail: `your tests fail with this change:\n${after.summary}` };
      }
      this.tested = true;
    }
    return this.ciAfter(job, baseline.ci);
  }

  /**
   * The project's CI checks after the change: Fitts formats what it changed the project's way,
   * then a check that passed before and fails now fails the change (it would fail the PR). The
   * fixer hears about every broken check, with its output.
   */
  private async ciAfter(job: string, before: CiRun): Promise<Verdict | null> {
    if (!before.ran) return null;
    this.host.emit([{ type: 'now.changed', nowText: 'Running your CI checks' }]);
    const after = ((await this.site.fix({ fn: 'ci', job }).catch(() => NO_CI)) ?? NO_CI) as CiRun;
    const passed = new Map(before.checks.map((c) => [c.name, c.ok]));
    const broke = after.checks.filter((c) => !c.ok && passed.get(c.name) !== false);
    if (!broke.length) {
      if (after.checks.length) this.ciPassed = after.checks.map((c) => c.name);
      return null;
    }
    const first = broke[0];
    const names = broke.map((c) => `“${c.name}”`).join(', ');
    return {
      reason: `your CI ${broke.length === 1 ? 'check' : 'checks'} ${names} ${broke.length === 1 ? 'fails' : 'fail'} with this change: ${first?.summary.split('\n')[0] ?? 'see its output'}`,
      detail: broke
        .map(
          (c) => `your CI check “${c.name}” fails with this change:\n${c.summary || '(no output)'}`,
        )
        .join('\n\n'),
    };
  }

  /** The fixer's run_check: one CI check by name, the tests, or every CI check. */
  private async runCheck(job: string, name: string): Promise<{ ok: boolean; output: string }> {
    if (name === 'tests') {
      const t = (await this.site.fix({ fn: 'tests', job })) as TestRun;
      if (!t.ran) return { ok: true, output: 'the project has no test script' };
      return { ok: t.ok, output: `${t.ok ? 'ok' : 'FAIL'}: tests\n${t.summary}`.trim() };
    }
    const ci = ((await this.site.fix({ fn: 'ci', job, ...(name ? { only: name } : {}) })) ??
      NO_CI) as CiRun;
    if (!ci.ran || !ci.checks.length)
      return {
        ok: true,
        output: name ? `no CI check named "${name}"` : 'the project has no CI checks',
      };
    const ok = ci.checks.every((c) => c.ok);
    return {
      ok,
      output: ci.checks
        .map((c) => `${c.ok ? 'ok' : 'FAIL'}: ${c.name}${c.ok ? '' : `\n${c.summary}`}`)
        .join('\n'),
    };
  }

  get busy(): boolean {
    return this.running > 0 || this.queue.length > 0 || this.redesigning;
  }

  start(findingIds: string[]): void {
    const s = this.host.state();
    for (const id of this.fixable(findingIds)) {
      const f = s.findings.find((x) => x.id === id);
      if (!f || (f.status !== 'open' && f.status !== 'rolled-back')) continue;
      this.queue.push({ findingId: id, mode: s.mode });
      this.update(id, { status: 'fixing' });
    }
    this.pump();
  }

  /**
   * Try again (a rolled-back fix) or Redo (an undone one). A retry says in the chat what's
   * different this time, starts from what the last attempt found, and takes the user's note.
   */
  async retry(changeId: string, hint?: string): Promise<void> {
    const c = this.host.state().changes.find((x) => x.id === changeId);
    const f = c && this.host.state().findings.find((x) => c.findingIds.includes(x.id));
    if (!c || c.status === 'retrying') return;
    if (c.status === 'undone') {
      await this.redo(c);
      return;
    }
    if (!f) return;
    const last = c.reason ? ` Last time ${lowerFirst(c.reason)}.` : '';
    const plan = hint
      ? ` I’ll go by your note: “${hint}”.`
      : this.lastNotes.has(f.id)
        ? ' This time I’ll start from what I already found and take a different approach.'
        : ' This time I’ll take a different approach.';
    this.host.say(`Trying “${f.title}” again.${last}${plan}`);
    this.change({ ...c, status: 'retrying' });
    this.update(f.id, { status: 'fixing' });
    this.queue.push({
      findingId: f.id,
      changeId,
      ...(c.reason ? { retryReason: c.reason } : {}),
      ...(hint ? { hint } : {}),
      mode: this.host.state().mode,
    });
    this.pump();
  }

  private pump(): void {
    while (!this.redesigning && this.running < MAX_FIX_JOBS && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) break;
      this.running += 1;
      this.emitCount();
      void this.job(next).finally(() => {
        this.running -= 1;
        this.emitCount();
        this.pump();
        if (!this.busy) this.host.idle();
      });
    }
  }

  private emitCount(): void {
    this.host.emit([{ type: 'fixing.changed', fixingCount: this.running + this.queue.length }]);
  }

  private update(findingId: string, patch: Partial<Finding>): void {
    const f = this.host.state().findings.find((x) => x.id === findingId);
    if (f) this.host.emit([{ type: 'finding.updated', finding: { ...f, ...patch } }]);
  }

  private change(c: Change, created = false): void {
    this.host.emit([{ type: created ? 'change.created' : 'change.updated', change: c }]);
  }

  private fixTools(job: string): FixTools {
    return {
      read: async (path) => (await this.site.fix({ fn: 'read', job, path })) as string,
      search: async (text) =>
        (await this.site.fix({ fn: 'search', job, text })) as {
          path: string;
          line: number;
          text: string;
        }[],
      patch: async (path, find, replace) =>
        (await this.site.fix({ fn: 'patch', job, path, find, replace })) as {
          ok: boolean;
          error?: string;
        },
      check: (name) => this.runCheck(job, name),
    };
  }

  /**
   * One fix: the fixer, then verification. A change that fails a check stays in the worktree
   * and the fixer gets it back with what failed, up to MAX_REPAIRS times (Allen's feedback:
   * a redesign that worked was thrown away over one lint error). Then it passes or is reset.
   */
  private async job(p: Pending): Promise<void> {
    const f = this.host.state().findings.find((x) => x.id === p.findingId);
    const check = this.checks.get(p.findingId);
    // The redesign may have fixed it while it waited in the queue.
    if (!f || !check || f.status !== 'fixing') return;
    this.host.emit([{ type: 'now.changed', nowText: `Fixing “${f.title}”` }]);
    this.startedIn.add(p.mode);
    let reason: string | null = null;
    let summary = '';
    let passed = false;
    try {
      const run = await this.ensureRun();
      const baseline = await this.baselineChecks(run.job);
      const tools = this.fixTools(run.job);
      const budget = fixBudget(f, check);
      let failure: Verdict | null = null;
      for (let pass = 0; pass <= MAX_REPAIRS; pass++) {
        this.attempts.set(f.id, (this.attempts.get(f.id) ?? 0) + 1);
        const out = await this.fixer(
          taskFile(f, check, {
            ...(p.retryReason ? { retryReason: p.retryReason } : {}),
            ...(this.lastNotes.has(f.id) ? { lastAttempt: this.lastNotes.get(f.id) } : {}),
            ...(p.hint ? { hint: p.hint } : {}),
            ...this.checksFor(baseline),
            ...(failure ? { failure: failure.detail } : {}),
          }),
          tools,
          {
            findingId: f.id,
            onStep: (line) => this.host.emit([{ type: 'now.changed', nowText: line }]),
            ...(pass === 0
              ? { budget, more: (steps: number) => this.keepGoing(f, steps) }
              : { budget: repairBudget(budget), hardMax: repairBudget(budget) }),
          },
        );
        summary = out.summary || summary;
        if (out.notes) this.lastNotes.set(f.id, out.notes);
        if (out.patched === 0) {
          // A repair that changed nothing leaves the last failure as the reason.
          reason =
            pass === 0 ? (summary ? `no change made: ${summary}` : 'no change made') : reason;
          break;
        }
        this.host.emit([{ type: 'now.changed', nowText: `Checking the fix for “${f.title}”` }]);
        const route = check.routes[0] ?? f.route;
        const after = (await this.site.fix({
          fn: 'verify',
          job: run.job,
          route,
          hrefs: check.hrefs,
        })) as VerifyResult;
        const probe = judge(check, after, this.host.baseline(route));
        failure = probe ? probeVerdict(probe, after) : await this.testsAfter(run.job, baseline);
        if (failure === null) {
          await this.pass(p, f, check, run, summary);
          passed = true;
          break;
        }
        reason = failure.reason;
        // The owner said stop: no repair pass behind their back.
        if (pass >= MAX_REPAIRS || out.end === 'declined') break;
        this.host.say(
          `The fix for “${f.title}” didn’t pass yet: ${lowerFirst(reason)}. Fixing that now.`,
        );
      }
    } catch (e) {
      reason = (e as Error).message;
    }
    if (!passed) await this.fail(p, f, reason ?? 'no change made');
  }

  /**
   * A fix past its step budget that's still making progress: Autonomous and Dangerous keep
   * going; the ask modes ask, with what it has cost so far; Plan never gets here.
   */
  private keepGoing(f: Finding, steps: number): Promise<boolean> {
    const mode = this.host.state().mode;
    if (isAuto(mode)) return Promise.resolve(true);
    const spent = this.host.costOf(f.id);
    return this.host.ask(
      `“${f.title}” is taking longer than usual: ${steps} steps so far${spent > 0 ? `, $${spent.toFixed(2)}` : ''}. I’m still finding new things. Can I keep going?`,
    );
  }

  /** A verified fix: committed on the run's branch (and pushed, if the run's PR is open). */
  private async pass(
    p: Pending,
    f: Finding,
    check: Check,
    run: { job: string; branch: string },
    summary: string,
  ) {
    const diff = diffOf((await this.site.fix({ fn: 'diff', job: run.job })) as string);
    const commit = (await this.site.fix({
      fn: 'commit',
      job: run.job,
      message: `${f.title} (Fitts: ${f.heuristic ?? f.lens} sev ${f.severity})`,
    })) as { ok: boolean; sha?: string; error?: string };
    if (!commit.ok) throw new Error(`commit failed: ${commit.error ?? ''}`);
    if (commit.sha) this.lastGood = commit.sha;
    const changeId = p.changeId ?? `${f.runId}-c${this.host.state().changes.length + 1}`;
    const costUsd = this.host.costOf(f.id);
    const change: Change = {
      id: changeId,
      findingIds: [f.id],
      kind: 'fix',
      title: f.title,
      severity: f.severity,
      costUsd,
      status: 'verified',
      branch: run.branch,
      ...(commit.sha ? { sha: commit.sha } : {}),
      attempts: this.attempts.get(f.id) ?? 1,
      ...(this.runPr ? { prNumber: this.runPr.number, prUrl: this.runPr.url } : {}),
    };
    this.sections.set(changeId, fixSection(f, check, summary));
    this.change(change, !p.changeId);
    this.update(f.id, {
      status: this.runPr ? 'pr-opened' : 'verified',
      diff,
      costUsd,
      ...(this.runPr ? { prNumber: this.runPr.number, prUrl: this.runPr.url } : {}),
    });
    if (p.changeId) this.host.say(`That worked: “${f.title}” is fixed and checked.`);
    if (!p.changeId)
      this.host.emit([
        { type: 'chat.item', item: { id: this.host.id(), type: 'fix.result', changeId } },
      ]);
    // A retry after the run ended: the open PR gets the commit.
    if (this.runPr) await this.site.fix({ fn: 'push', job: run.job }).catch(() => undefined);
    this.host.settled?.(change);
  }

  /** A failed fix: the worktree goes back to the last good commit, and the change says why. */
  private async fail(p: Pending, f: Finding, reason: string) {
    if (this.run)
      await this.site
        .fix({ fn: 'reset', job: this.run.job, ...(this.lastGood ? { to: this.lastGood } : {}) })
        .catch(() => undefined);
    const changeId = p.changeId ?? `${f.runId}-c${this.host.state().changes.length + 1}`;
    const prev = this.host.state().changes.find((c) => c.id === changeId);
    const change: Change = {
      ...(prev ?? {
        id: changeId,
        findingIds: [f.id],
        kind: 'fix',
        title: f.title,
        severity: f.severity,
      }),
      costUsd: this.host.costOf(f.id),
      status: 'rolled-back',
      reason,
      attempts: this.attempts.get(f.id) ?? 1,
    };
    this.change(change, !prev);
    this.update(f.id, { status: 'rolled-back' });
    if (!prev)
      this.host.emit([
        { type: 'chat.item', item: { id: this.host.id(), type: 'fix.result', changeId } },
      ]);
    // A retry that failed again says so, and what you can do next.
    else if (p.changeId)
      this.host.say(
        `That didn’t work either: ${lowerFirst(reason)}. I put everything back. You can try again with a note for me (where the code lives, what you’d do), or leave it.`,
      );
    this.host.settled?.(change);
  }

  /** Waits for the running job: undo and redo need the worktree clean. */
  private async whenIdle(): Promise<void> {
    while (this.busy) await new Promise((res) => setTimeout(res, 300));
  }

  /**
   * §9.4 undo: a revert commit on the run's branch (pushed if the PR is open), or a revert PR
   * once the run's PR was merged. A change later ones build on can't go on its own.
   */
  async undo(changeId: string): Promise<void> {
    const c = this.host.state().changes.find((x) => x.id === changeId);
    if (!c || c.status === 'undone') return;
    if (c.sha && this.run) {
      await this.whenIdle();
      const merged = this.runPr
        ? ((await this.site.fix({ fn: 'prMerged', pr: this.runPr.number })) as boolean)
        : false;
      if (merged && this.runPr) {
        const pr = (await this.site.fix({
          fn: 'revert',
          runId: this.host.state().runId,
          pr: this.runPr.number,
          branch: this.run.branch,
          title: `Revert “${c.title}”`,
          body: `Reverts “${c.title}” from #${this.runPr.number}. Undone in Fitts.`,
          sha: c.sha,
        })) as { number: number; url: string };
        this.host.say(`Revert PR #${pr.number} opened.`);
        this.change({ ...c, status: 'undone', revertPrNumber: pr.number });
      } else {
        const r = (await this.site.fix({ fn: 'revertCommit', job: this.run.job, sha: c.sha })) as {
          ok: boolean;
          sha?: string;
          error?: string;
        };
        if (!r.ok) {
          const all = this.host.state().changes;
          const later = all
            .slice(all.indexOf(c) + 1)
            .filter((x) => x.status === 'verified' && x.sha).length;
          this.host.say(
            later > 0
              ? `I can’t undo “${c.title}” on its own: ${later} later ${later === 1 ? 'change builds' : 'changes build'} on it. Undo ${later === 1 ? 'that one' : 'those'} first.`
              : `I couldn’t undo “${c.title}”: ${r.error ?? 'the revert didn’t apply'}.`,
          );
          return;
        }
        if (r.sha) this.lastGood = r.sha;
        if (this.runPr) {
          await this.site.fix({ fn: 'push', job: this.run.job });
          this.host.say(`Undone · pushed to PR #${this.runPr.number}.`);
        } else this.host.say('Undone.');
        this.change({ ...c, status: 'undone', ...(r.sha ? { revertSha: r.sha } : {}) });
      }
    } else this.change({ ...c, status: 'undone' });
    for (const id of c.findingIds) this.update(id, { status: 'undone' });
  }

  /** Redo of an undone change: the revert is reverted, on the same branch. */
  private async redo(c: Change): Promise<void> {
    if (!this.run) return;
    if (!c.revertSha) {
      this.host.say(
        c.revertPrNumber !== undefined
          ? `“${c.title}” is in revert PR #${c.revertPrNumber} now; close that to keep the change.`
          : `I can’t redo “${c.title}”: it isn’t on the branch.`,
      );
      return;
    }
    await this.whenIdle();
    const r = (await this.site.fix({
      fn: 'revertCommit',
      job: this.run.job,
      sha: c.revertSha,
    })) as { ok: boolean; sha?: string; error?: string };
    if (!r.ok) {
      this.host.say(`I couldn’t redo “${c.title}”: ${r.error ?? 'the revert didn’t apply'}.`);
      return;
    }
    if (r.sha) this.lastGood = r.sha;
    if (this.runPr) await this.site.fix({ fn: 'push', job: this.run.job });
    const back: Change = { ...c, status: 'verified', ...(r.sha ? { sha: r.sha } : {}) };
    delete back.revertSha;
    this.change(back);
    for (const id of c.findingIds)
      this.update(id, { status: this.runPr ? 'pr-opened' : 'verified' });
    this.host.say(this.runPr ? `Redone · pushed to PR #${this.runPr.number}.` : 'Redone.');
  }

  /**
   * FINALIZE (§9.3): the run's one PR, with every verified change, per the mode. Plan never;
   * Ask every action asks, as does a run whose jobs started in Autonomous when the mode has
   * since changed. Declined, the branch keeps everything and a later ask can still open it.
   */
  async finalize(): Promise<{ number: number; url: string } | undefined> {
    if (this.runPr || !this.run) return this.runPr;
    const s = this.host.state();
    const verified = s.changes.filter((c) => c.status === 'verified' && c.kind !== 'wording');
    if (!verified.length || s.mode === 'plan') return undefined;
    const startedAuto = [...this.startedIn].some(isAuto);
    const n = verified.length;
    if (
      (s.mode === 'ask-every' || (startedAuto && !isAuto(s.mode))) &&
      !(await this.host.ask(
        `Every change is checked on ${this.run.branch}. Can I push it to GitHub and open ${n === 1 ? 'a pull request for it' : `one pull request with all ${n} of them`}?`,
      ))
    ) {
      this.host.say(
        `${this.run.branch} has everything, checked. Ask me and I’ll open the pull request.`,
      );
      return undefined;
    }
    try {
      const pr = (await this.site.fix({
        fn: 'prOpen',
        job: this.run.job,
        title: runPrTitle(verified),
        body: runPrBody(
          verified.flatMap((c) => {
            const section = this.sections.get(c.id);
            return section ? [section] : [];
          }),
          {
            tested: this.tested,
            ci: this.ciPassed,
            redesigned: verified.some((c) => c.kind === 'redesign'),
          },
        ),
      })) as { number: number; url: string };
      this.runPr = pr;
      for (const c of s.changes.filter((x) => x.status === 'verified'))
        this.change({ ...c, prNumber: pr.number, prUrl: pr.url });
      for (const c of verified)
        for (const id of c.findingIds) {
          const f = s.findings.find((x) => x.id === id);
          if (f?.status === 'verified')
            this.update(id, { status: 'pr-opened', prNumber: pr.number, prUrl: pr.url });
        }
      return pr;
    } catch (e) {
      this.host.say(
        `Every change is on ${this.run.branch}, but I couldn’t open the pull request: ${(e as Error).message}`,
      );
      return undefined;
    }
  }

  // ── Redesign (§8.3) ─────────────────────────────────────────────────────────

  /**
   * Applies a direction as one job on the run's branch: it waits for running fixes, then runs
   * alone. A pass that fails verification gets back to the redesigner with what failed, up to
   * MAX_REPAIRS times. On pass: the after shots, the findings it fixed, a wording card per
   * wording change, the owner's review, and a commit for the run's PR.
   */
  async redesign(r: RedesignRequest): Promise<'verified' | 'rolled-back' | 'unavailable'> {
    const redesigner = this.redesigner;
    if (!redesigner || this.redesignJob) return 'unavailable';
    this.redesigning = true;
    this.emitCount();
    while (this.running > 0) await new Promise((res) => setTimeout(res, 300));
    this.startedIn.add(this.host.state().mode);
    const name = r.direction.name;
    const steps = [
      `Restyle every page as ${name}`,
      `Check all ${r.routes.length} pages`,
      'Keep it on the branch',
    ];
    const progressId = this.host.id();
    const progress = (done: number): ChatItem => ({
      id: progressId,
      type: 'progress',
      title: 'Applying the look',
      items: steps.map((text, i) => ({
        text,
        state: i < done ? 'done' : i === done ? 'doing' : 'todo',
      })),
    });
    this.host.emit([
      { type: 'chat.item', item: progress(0) },
      { type: 'activity.changed', activity: 'redesigning' },
      { type: 'now.changed', nowText: `Applying ${name} to every page` },
    ]);
    const changeId = `${this.host.state().runId}-redesign`;
    let reason: string | null = null;
    try {
      const run = await this.ensureRun();
      const baseline = await this.baselineChecks(run.job);
      // The direction's fonts and three.js go in first, so the redesigner can use them.
      const spec = r.direction.spec;
      r = {
        ...r,
        assets: (await this.site.fix({
          fn: 'assets',
          job: run.job,
          fonts: specFonts(spec).map(({ family, id, weights }) => ({ family, id, weights })),
          three: spec.three,
        })) as AssetsResult,
      };
      const tools = this.redesignTools(run.job);
      let summary = '';
      const wording: WordingChange[] = [];
      let after: VerifyPagesResult | undefined;
      let failure: Verdict | null = null;
      for (let pass = 0; pass <= MAX_REPAIRS; pass++) {
        const out = await redesigner(
          redesignTask({
            ...r,
            ...this.checksFor(baseline),
            ...(failure ? { retryReason: failure.detail } : {}),
          }),
          tools,
          {
            images: r.images,
            onStep: (line) => this.host.emit([{ type: 'now.changed', nowText: line }]),
          },
        );
        summary = out.summary || summary;
        wording.push(...out.wording);
        if (out.patched === 0) {
          if (pass === 0) reason = summary ? `no change made: ${summary}` : 'no change made';
          break;
        }
        this.host.emit([
          { type: 'chat.item.updated', item: progress(1) },
          { type: 'now.changed', nowText: `Checking all ${r.routes.length} pages` },
        ]);
        after = (await this.site.fix({
          fn: 'verifyPages',
          job: run.job,
          routes: r.routes,
          ...(r.size ? { size: r.size } : {}),
        })) as VerifyPagesResult;
        const pages = judgeRedesign(after, (route) => this.host.baseline(route));
        const style = pages ? null : judgeStyle(after, spec, r.assets);
        const probe = pages ?? style;
        failure = probe
          ? { reason: probe, detail: probe }
          : await this.testsAfter(run.job, baseline);
        reason = failure?.reason ?? null;
        if (failure === null) break;
        if (pass < MAX_REPAIRS) {
          this.host.say(`That didn’t pass yet: ${lowerFirst(reason ?? '')}. Fixing that now.`);
          this.host.emit([{ type: 'chat.item.updated', item: progress(0) }]);
        }
      }
      if (reason === null && after) {
        await this.redesignPassed(r, changeId, run, after, summary, wording, () =>
          this.host.emit([{ type: 'chat.item.updated', item: progress(2) }]),
        );
        this.host.emit([{ type: 'chat.item.updated', item: progress(3) }]);
      }
    } catch (e) {
      reason = (e as Error).message;
    }
    if (reason !== null) {
      if (this.run)
        await this.site
          .fix({ fn: 'reset', job: this.run.job, ...(this.lastGood ? { to: this.lastGood } : {}) })
          .catch(() => undefined);
      const change: Change = {
        id: changeId,
        findingIds: [],
        kind: 'redesign',
        title: `Redesign: ${name}`,
        costUsd: this.host.costOf('redesign'),
        status: 'rolled-back',
        reason,
      };
      this.change(change, true);
      this.host.say(
        `I rolled the redesign back: ${reason}. Your site is unchanged; I’ll carry on with the other fixes.`,
      );
      this.host.settled?.(change);
    }
    this.redesigning = false;
    this.emitCount();
    this.pump();
    if (!this.busy) this.host.idle();
    return reason === null ? 'verified' : 'rolled-back';
  }

  private redesignTools(job: string): RedesignTools {
    return {
      ...this.fixTools(job),
      list: async (dir) => (await this.site.fix({ fn: 'list', job, dir })) as string[],
      write: async (path, content) =>
        (await this.site.fix({ fn: 'write', job, path, content })) as {
          ok: boolean;
          error?: string;
        },
    };
  }

  private async afterShots(after: VerifyPagesResult, r: RedesignRequest) {
    const pages: NonNullable<Change['pages']> = [];
    for (const p of after.pages) {
      if (!p.jpegBase64) continue;
      const url = await r.saveShot(p.route, p.jpegBase64).catch(() => null);
      const before = r.before[p.route];
      if (url) pages.push({ route: p.route, ...(before ? { before } : {}), after: url });
    }
    return pages;
  }

  private async redesignPassed(
    r: RedesignRequest,
    changeId: string,
    run: { job: string; branch: string },
    after: VerifyPagesResult,
    summary: string,
    wording: WordingChange[],
    onCommitted: () => void,
  ): Promise<void> {
    const s = this.host.state();
    const fixedIds = fixedByRedesign(after, s.findings, this.checks);
    const pages = await this.afterShots(after, r);
    const commit = (await this.site.fix({
      fn: 'commit',
      job: run.job,
      message: `Redesign: ${r.direction.name} (Fitts: look and feel)`,
    })) as { ok: boolean; sha?: string; error?: string };
    if (!commit.ok) throw new Error(`commit failed: ${commit.error ?? ''}`);
    // "Start over" in the review goes back to before the redesign.
    const before = this.lastGood;
    if (commit.sha) this.lastGood = commit.sha;
    this.redesignJob = { changeId, request: r };
    // Findings it fixed leave the queue and count as verified by the redesign.
    for (let i = this.queue.length - 1; i >= 0; i--)
      if (fixedIds.includes(this.queue[i]?.findingId ?? '')) this.queue.splice(i, 1);
    for (const id of fixedIds) this.update(id, { status: 'verified' });
    const change: Change = {
      id: changeId,
      findingIds: fixedIds,
      kind: 'redesign',
      title: `Redesign: ${r.direction.name}`,
      costUsd: this.host.costOf('redesign'),
      status: 'verified',
      branch: run.branch,
      ...(commit.sha ? { sha: commit.sha } : {}),
      pages,
    };
    this.change(change, true);
    const events: RunEvent[] = [];
    wording.forEach((w, i) => {
      const itemId = this.host.id();
      const wordingChange = `${changeId}-w${i + 1}`;
      this.wording.set(itemId, { ...w, changeId: wordingChange });
      events.push(
        {
          type: 'change.created',
          change: {
            id: wordingChange,
            findingIds: [],
            kind: 'wording',
            title: `“${w.from}” → “${w.to}”`,
            costUsd: 0,
            status: 'verified',
            branch: run.branch,
          },
        },
        { type: 'chat.item', item: { id: itemId, type: 'wording', from: w.from, to: w.to } },
      );
    });
    if (events.length) this.host.emit(events);
    onCommitted();
    // The owner reviews it before it joins the run's PR (§2.4); "Start over" rolls it back.
    const verdict = (await this.host.review?.(changeId, (text) => this.adjust(text, true))) ?? 'ok';
    if (verdict === 'restart') {
      for (const id of fixedIds) this.update(id, { status: 'open' });
      for (const w of this.wording.values()) {
        const c = this.host.state().changes.find((x) => x.id === w.changeId);
        if (c) this.change({ ...c, status: 'undone' });
      }
      this.wording.clear();
      this.redesignJob = undefined;
      this.lastGood = before;
      throw new Error('you asked to start over');
    }
    const fixed = s.findings.filter((f) => fixedIds.includes(f.id));
    this.sections.set(
      changeId,
      redesignSection({
        ...r,
        summary,
        wording: wording.filter((w) => this.stillWorded(w)),
        fixed,
      }),
    );
    this.host.say(
      `Your site now uses ${r.direction.name}, and every page still works.` +
        (fixed.length ? ` The new look also fixed ${fixed.length} of the problems I found.` : '') +
        ' It goes in the pull request when I’m done.',
    );
    this.host.settled?.(this.host.state().changes.find((c) => c.id === changeId) ?? change);
  }

  /** A wording change the owner hasn't undone. */
  private stillWorded(w: WordingChange): boolean {
    const entry = [...this.wording.values()].find((x) => x.from === w.from && x.to === w.to);
    const c = entry && this.host.state().changes.find((x) => x.id === entry.changeId);
    return c?.status !== 'undone';
  }

  /** "Undo this" on one wording card: just that line goes back, on the run's branch. */
  async decideWording(itemId: string, decision: 'keep' | 'undo'): Promise<boolean> {
    const w = this.wording.get(itemId);
    const rj = this.redesignJob;
    if (!w || !rj || !this.run) return false;
    if (decision === 'keep') return true;
    const back = (await this.site.fix({
      fn: 'patch',
      job: this.run.job,
      path: w.path,
      find: w.to,
      replace: w.from,
    })) as { ok: boolean; error?: string };
    if (!back.ok) throw new Error(back.error ?? 'the text changed since');
    const commit = (await this.site.fix({
      fn: 'commit',
      job: this.run.job,
      message: `Keep the original wording “${w.from}” (Fitts)`,
    })) as { ok: boolean; sha?: string; error?: string };
    if (!commit.ok) throw new Error(`commit failed: ${commit.error ?? ''}`);
    if (commit.sha) this.lastGood = commit.sha;
    if (this.runPr) await this.site.fix({ fn: 'push', job: this.run.job });
    const c = this.host.state().changes.find((x) => x.id === w.changeId);
    if (c) this.change({ ...c, status: 'undone' });
    return true;
  }

  /** True while there's a verified redesign that "Adjust it" can change. */
  get canAdjust(): boolean {
    const c = this.host.state().changes.find((x) => x.id === this.redesignJob?.changeId);
    return Boolean(c && c.status === 'verified' && !this.redesigning);
  }

  /**
   * "Adjust it": the redesigner changes what the user asked, verified like the first pass.
   * `inReview`: during the final review (§2.4), while the redesign itself is still running.
   */
  async adjust(text: string, inReview = false): Promise<void> {
    const rj = this.redesignJob;
    const redesigner = this.redesigner;
    const run = this.run;
    if (!rj || !redesigner || !run || (!inReview && !this.canAdjust)) return;
    this.redesigning = true;
    this.emitCount();
    this.host.emit([
      { type: 'activity.changed', activity: 'redesigning' },
      { type: 'now.changed', nowText: 'Adjusting the redesign' },
    ]);
    const r = rj.request;
    try {
      const out = await redesigner(
        redesignTask({ ...r, adjust: text }),
        this.redesignTools(run.job),
        {
          images: r.images,
          onStep: (line) => this.host.emit([{ type: 'now.changed', nowText: line }]),
        },
      );
      if (out.patched === 0) {
        this.host.say(`I didn’t change anything: ${out.summary || 'I couldn’t find a safe way'}.`);
        return;
      }
      const after = (await this.site.fix({
        fn: 'verifyPages',
        job: run.job,
        routes: r.routes,
        ...(r.size ? { size: r.size } : {}),
      })) as VerifyPagesResult;
      let reason = judgeRedesign(after, (route) => this.host.baseline(route));
      const baseline: Baseline = await (this.baseline ??
        Promise.resolve({ tests: { ran: false, ok: true, summary: '' }, ci: NO_CI }));
      if (reason === null) reason = (await this.testsAfter(run.job, baseline))?.reason ?? null;
      if (reason !== null) {
        await this.site.fix({ fn: 'reset', job: run.job });
        this.host.say(`I undid that adjustment: ${reason}. The redesign is as it was.`);
        return;
      }
      const commit = (await this.site.fix({
        fn: 'commit',
        job: run.job,
        message: `Adjust the redesign: ${text.slice(0, 60)} (Fitts)`,
      })) as { ok: boolean; sha?: string; error?: string };
      if (!commit.ok) throw new Error(`commit failed: ${commit.error ?? ''}`);
      if (commit.sha) this.lastGood = commit.sha;
      if (this.runPr) await this.site.fix({ fn: 'push', job: run.job });
      const pages = await this.afterShots(after, r);
      const c = this.host.state().changes.find((x) => x.id === rj.changeId);
      if (c) this.change({ ...c, pages, costUsd: this.host.costOf('redesign') });
      this.host.say(
        `Done: ${out.summary || 'adjusted'}${this.runPr ? ` The pull request #${this.runPr.number} is updated.` : ''}`,
      );
    } catch (e) {
      await this.site.fix({ fn: 'reset', job: run.job }).catch(() => undefined);
      this.host.say(`I couldn’t adjust it: ${(e as Error).message}`);
    } finally {
      // In review the redesign is still running; it ends (and resets these) when it's done.
      if (!inReview) {
        this.redesigning = false;
        this.emitCount();
        this.pump();
        this.host.emit([{ type: 'activity.changed', activity: this.host.restingActivity() }]);
        if (!this.busy) this.host.idle();
      }
    }
  }
}
