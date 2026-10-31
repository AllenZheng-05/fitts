// The fix pipeline (SPEC-phase2 §9): at most 2 jobs at a time. Each job gets a worktree, runs the
// fixer, then is verified on the worktree's own dev server: the finding's probe must stop
// reporting the problem and no new severity ≥2 problems may appear on that route. Only then is
// it committed (and its PR opened, per mode); otherwise it's rolled back with a reason. Undo
// closes the PR (or opens a revert PR when it was merged); retry runs the job again.
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
import type { AssetsResult, TestRun, VerifyPagesResult, VerifyResult } from '../protocol';
import { problems, type Check } from '../review/aggregate';
import type { Direction } from '../review/themefit';
import type { Site } from '../site-client';
import { taskFile, type FixTools } from './fixer';
import {
  fixedByRedesign,
  judgeRedesign,
  judgeStyle,
  redesignPrBody,
  redesignTask,
  type RedesignTools,
  type WordingChange,
} from './redesign';

export const MAX_FIX_JOBS = 2;

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
}

export type Fixer = (
  task: string,
  tools: FixTools,
  opts: { findingId: string; onStep: (line: string) => void },
) => Promise<{ patched: number; summary: string }>;

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
  /** The mode when the fix was started (a change since Autonomous asks before the PR). */
  mode: Mode;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

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

/** The PR body (§9.3): heuristic and severity, finding, fix, evidence, verification, repro. */
export function prBody(
  f: Finding,
  check: Check | undefined,
  summary: string,
  tested = false,
): string {
  return [
    `**${f.heuristic ?? f.lens}** · severity ${f.severity}`,
    '',
    `## Problem`,
    f.finding,
    '',
    `## Fix`,
    summary || f.fix,
    '',
    `## Evidence`,
    ...f.evidence.map((e) => `- ${e}`),
    '',
    `## Verification`,
    check
      ? `Re-ran the ${check.probe} probe on ${check.routes[0] ?? f.route} against this branch's dev server: “${check.title}” is gone, and no new problems at severity 2 or higher appeared (360, 768 and 1280px).${tested ? ' Your test suite still passes on this branch.' : ''}`
      : 'Re-checked by the reviewer panel.',
    '',
    `## Repro`,
    `Open ${f.route}${f.elementRef ? ` and find the element \`${f.elementRef}\`` : ''}.`,
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
  /** Each change's worktree job (for redo, undo and revert). */
  private readonly jobs = new Map<string, { job: string; branch: string; findingId: string }>();
  /** A redesign runs alone and first (§9.2): fix jobs wait while it does. */
  private redesigning = false;
  /** A verified redesign's branch: later fixes start from it, and their PRs stack on it. */
  private base: string | undefined;
  private redesignJob: { changeId: string; job: string; request: RedesignRequest } | undefined;
  /** Each wording card's change, so "Undo this" can revert just that line. */
  private readonly wording = new Map<string, WordingChange & { changeId: string }>();
  /** The project's own tests on an untouched worktree, once per starting point (HEAD, redesign). */
  private readonly testBaselines = new Map<string, Promise<TestRun>>();
  /** Jobs whose change kept the project's tests passing (the PR says so). */
  private readonly testedJobs = new Set<string>();

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

  /**
   * The project's tests before any change, on this fresh worktree: once per starting point, so
   * later jobs reuse it. Tests that can't run count as "nothing to compare against".
   */
  private baselineTests(job: string): Promise<TestRun> {
    const key = this.base ?? 'HEAD';
    let baseline = this.testBaselines.get(key);
    if (!baseline) {
      baseline = (this.site.fix({ fn: 'tests', job }) as Promise<TestRun>).catch(() => ({
        ran: false,
        ok: true,
        summary: '',
      }));
      this.testBaselines.set(key, baseline);
    }
    return baseline;
  }

  /** After a change that passed its checks: does the project's own test suite still pass? */
  private async testsAfter(job: string, baseline: TestRun): Promise<string | null> {
    // Tests that already failed (or never ran) before the change can't tell us anything.
    if (!baseline?.ran || !baseline.ok) return null;
    this.host.emit([{ type: 'now.changed', nowText: 'Running your tests' }]);
    const after = (await this.site.fix({ fn: 'tests', job })) as TestRun;
    if (after.ok) {
      this.testedJobs.add(job);
      return null;
    }
    return `your tests fail with this change: ${after.summary.split('\n')[0] ?? 'see the test output'}`;
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

  retry(changeId: string): void {
    const c = this.host.state().changes.find((x) => x.id === changeId);
    const f = c && this.host.state().findings.find((x) => c.findingIds.includes(x.id));
    if (!c || !f) return;
    if (c.status === 'undone' && c.prNumber !== undefined) {
      void this.reopen(c);
      return;
    }
    this.change({ ...c, status: 'retrying' });
    this.update(f.id, { status: 'fixing' });
    this.queue.push({
      findingId: f.id,
      changeId,
      ...(c.reason ? { retryReason: c.reason } : {}),
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

  private async job(p: Pending): Promise<void> {
    const f = this.host.state().findings.find((x) => x.id === p.findingId);
    const check = this.checks.get(p.findingId);
    // The redesign may have fixed it while it waited in the queue.
    if (!f || !check || f.status !== 'fixing') return;
    this.host.emit([{ type: 'now.changed', nowText: `Fixing “${f.title}”` }]);
    const branch = `fitts/${(f.heuristic ?? f.lens).toLowerCase()}-${slug(f.title)}`;
    let job: string | undefined;
    let reason: string | null = null;
    let summary = '';
    try {
      const prepared = (await this.site.fix({
        fn: 'prepare',
        runId: f.runId,
        findingId: f.id,
        branch,
        ...(this.base ? { base: this.base } : {}),
      })) as { job: string; branch: string };
      job = prepared.job;
      const baseline = await this.baselineTests(prepared.job);
      const tools: FixTools = {
        read: async (path) =>
          (await this.site.fix({ fn: 'read', job: prepared.job, path })) as string,
        search: async (text) =>
          (await this.site.fix({ fn: 'search', job: prepared.job, text })) as {
            path: string;
            line: number;
            text: string;
          }[],
        patch: async (path, find, replace) =>
          (await this.site.fix({ fn: 'patch', job: prepared.job, path, find, replace })) as {
            ok: boolean;
            error?: string;
          },
      };
      const out = await this.fixer(taskFile(f, check, p.retryReason), tools, {
        findingId: f.id,
        onStep: (line) => this.host.emit([{ type: 'now.changed', nowText: line }]),
      });
      summary = out.summary;
      if (out.patched === 0) reason = summary ? `no change made: ${summary}` : 'no change made';
      else {
        this.host.emit([{ type: 'now.changed', nowText: `Checking the fix for “${f.title}”` }]);
        const route = check.routes[0] ?? f.route;
        const after = (await this.site.fix({
          fn: 'verify',
          job: prepared.job,
          route,
          hrefs: check.hrefs,
        })) as VerifyResult;
        reason = judge(check, after, this.host.baseline(route));
        if (reason === null) reason = await this.testsAfter(prepared.job, baseline);
      }
      if (reason === null) await this.pass(p, f, check, prepared.job, prepared.branch, summary);
    } catch (e) {
      reason = (e as Error).message;
    }
    if (reason !== null) await this.fail(p, f, job, reason);
  }

  private async pass(
    p: Pending,
    f: Finding,
    check: Check,
    job: string,
    branch: string,
    summary: string,
  ) {
    const diff = diffOf((await this.site.fix({ fn: 'diff', job })) as string);
    const commit = (await this.site.fix({
      fn: 'commit',
      job,
      message: `${f.title} (Fitts: ${f.heuristic ?? f.lens} sev ${f.severity})`,
    })) as { ok: boolean; error?: string };
    if (!commit.ok) throw new Error(`commit failed: ${commit.error ?? ''}`);
    const changeId = p.changeId ?? `${f.runId}-c${this.host.state().changes.length + 1}`;
    this.jobs.set(changeId, { job, branch, findingId: f.id });
    const costUsd = this.host.costOf(f.id);
    const change: Change = {
      id: changeId,
      findingIds: [f.id],
      kind: 'fix',
      title: f.title,
      severity: f.severity,
      costUsd,
      status: 'verified',
      branch,
    };
    this.change(change, !p.changeId);
    this.update(f.id, { status: 'verified', diff, costUsd });
    if (!p.changeId)
      this.host.emit([
        { type: 'chat.item', item: { id: this.host.id(), type: 'fix.result', changeId } },
      ]);
    await this.openPr(p, change, f, check, job, summary);
  }

  /** §9.3: Autonomous and Dangerous open it; an approved fix covers its PR; Plan never fixes. */
  private async openPr(
    p: Pending,
    change: Change,
    f: Finding,
    check: Check,
    job: string,
    summary: string,
  ) {
    const mode = this.host.state().mode;
    if (mode === 'plan') return;
    const startedAuto = p.mode === 'autonomous' || p.mode === 'dangerous';
    const nowAuto = mode === 'autonomous' || mode === 'dangerous';
    if (
      startedAuto &&
      !nowAuto &&
      !(await this.host.ask(`Can I open a pull request for “${f.title}”?`))
    )
      return;
    try {
      const pr = (await this.site.fix({
        fn: 'prOpen',
        job,
        title: f.title,
        body: prBody(f, check, summary, this.testedJobs.has(job)),
        ...(this.base ? { base: this.base } : {}),
      })) as { number: number; url: string };
      this.change({ ...change, prNumber: pr.number, prUrl: pr.url });
      this.update(f.id, { status: 'pr-opened', prNumber: pr.number, prUrl: pr.url });
    } catch (e) {
      this.host.say(
        `The fix for “${f.title}” is verified, but I couldn’t open its pull request: ${(e as Error).message}`,
      );
    }
  }

  private async fail(p: Pending, f: Finding, job: string | undefined, reason: string) {
    if (job) await this.site.fix({ fn: 'discard', job }).catch(() => undefined);
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
    };
    this.change(change, !prev);
    this.update(f.id, { status: 'rolled-back' });
    if (!prev)
      this.host.emit([
        { type: 'chat.item', item: { id: this.host.id(), type: 'fix.result', changeId } },
      ]);
  }

  /** §9.4 undo: close an open PR (deleting its branch), or open a revert PR for a merged one. */
  async undo(changeId: string): Promise<void> {
    const c = this.host.state().changes.find((x) => x.id === changeId);
    const j = this.jobs.get(changeId);
    if (!c || c.status === 'undone') return;
    if (c.prNumber !== undefined && j) {
      const merged = (await this.site.fix({ fn: 'prMerged', pr: c.prNumber })) as boolean;
      if (merged) {
        const f = this.host.state().findings.find((x) => x.id === j.findingId);
        const pr = (await this.site.fix({
          fn: 'revert',
          runId: this.host.state().runId,
          pr: c.prNumber,
          branch: j.branch,
          title: `Revert “${c.title}”`,
          body: `Reverts #${c.prNumber}${f ? ` (${f.title})` : ''}. Undone in Fitts.`,
        })) as { number: number; url: string };
        this.host.say(`Revert PR #${pr.number} opened.`);
      } else {
        await this.site.fix({ fn: 'prClose', pr: c.prNumber, branch: j.branch });
        this.host.say(`Undone · PR #${c.prNumber} closed.`);
      }
    }
    this.change({ ...c, status: 'undone' });
    for (const id of c.findingIds) this.update(id, { status: 'undone' });
    // Fixes from here on start from the project's own HEAD again.
    if (c.kind === 'redesign') this.base = undefined;
  }

  // ── Redesign (§8.3) ─────────────────────────────────────────────────────────

  /**
   * Applies a direction as one job: it waits for running fixes, then runs alone. Up to two
   * passes (the second gets the first one's verification failure). On pass: the after shots,
   * the findings it fixed, a wording card per wording change, and one PR.
   */
  async redesign(r: RedesignRequest): Promise<'verified' | 'rolled-back' | 'unavailable'> {
    const redesigner = this.redesigner;
    if (!redesigner || this.redesignJob) return 'unavailable';
    this.redesigning = true;
    this.emitCount();
    while (this.running > 0) await new Promise((res) => setTimeout(res, 300));
    const name = r.direction.name;
    const steps = [
      `Restyle every page as ${name}`,
      `Check all ${r.routes.length} pages`,
      'Open the pull request',
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
    let job: string | undefined;
    let reason: string | null = null;
    try {
      const prepared = (await this.site.fix({
        fn: 'prepare',
        runId: this.host.state().runId,
        findingId: 'redesign',
        branch: `fitts/redesign-${slug(name)}`,
      })) as { job: string; branch: string };
      job = prepared.job;
      const baseline = await this.baselineTests(prepared.job);
      // The direction's fonts and three.js go in first, so the redesigner can use them.
      const spec = r.direction.spec;
      r = {
        ...r,
        assets: (await this.site.fix({
          fn: 'assets',
          job: prepared.job,
          fonts: specFonts(spec).map(({ family, id, weights }) => ({ family, id, weights })),
          three: spec.three,
        })) as AssetsResult,
      };
      const tools = this.redesignTools(prepared.job);
      let summary = '';
      const wording: WordingChange[] = [];
      let after: VerifyPagesResult | undefined;
      for (let pass = 0; pass < 2; pass++) {
        const out = await redesigner(
          redesignTask({ ...r, ...(reason ? { retryReason: reason } : {}) }),
          tools,
          {
            images: r.images,
            onStep: (line) => this.host.emit([{ type: 'now.changed', nowText: line }]),
          },
        );
        summary = out.summary || summary;
        wording.push(...out.wording);
        if (out.patched === 0 && pass === 0) {
          reason = summary ? `no change made: ${summary}` : 'no change made';
          break;
        }
        this.host.emit([
          { type: 'chat.item.updated', item: progress(1) },
          { type: 'now.changed', nowText: `Checking all ${r.routes.length} pages` },
        ]);
        after = (await this.site.fix({
          fn: 'verifyPages',
          job: prepared.job,
          routes: r.routes,
          ...(r.size ? { size: r.size } : {}),
        })) as VerifyPagesResult;
        reason =
          judgeRedesign(after, (route) => this.host.baseline(route)) ??
          judgeStyle(after, spec, r.assets);
        // The second pass hears about failing tests too, with what failed.
        if (reason === null) reason = await this.testsAfter(prepared.job, baseline);
        if (reason === null) break;
        if (pass === 0) {
          this.host.say(`The first pass broke something (${reason}). Fixing that now.`);
          this.host.emit([{ type: 'chat.item.updated', item: progress(0) }]);
        }
      }
      if (reason === null && after) {
        await this.redesignPassed(r, changeId, prepared, after, summary, wording, () =>
          this.host.emit([{ type: 'chat.item.updated', item: progress(2) }]),
        );
        this.host.emit([{ type: 'chat.item.updated', item: progress(3) }]);
      }
    } catch (e) {
      reason = (e as Error).message;
    }
    if (reason !== null) {
      if (job) await this.site.fix({ fn: 'discard', job }).catch(() => undefined);
      this.change(
        {
          id: changeId,
          findingIds: [],
          kind: 'redesign',
          title: `Redesign: ${name}`,
          costUsd: this.host.costOf('redesign'),
          status: 'rolled-back',
          reason,
        },
        true,
      );
      this.host.say(
        `I rolled the redesign back: ${reason}. Your site is unchanged; I’ll carry on with the other fixes.`,
      );
    }
    this.redesigning = false;
    this.emitCount();
    this.pump();
    if (!this.busy) this.host.idle();
    return reason === null ? 'verified' : 'rolled-back';
  }

  private redesignTools(job: string): RedesignTools {
    return {
      read: async (path) => (await this.site.fix({ fn: 'read', job, path })) as string,
      list: async (dir) => (await this.site.fix({ fn: 'list', job, dir })) as string[],
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
    prepared: { job: string; branch: string },
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
      job: prepared.job,
      message: `Redesign: ${r.direction.name} (Fitts: look and feel)`,
    })) as { ok: boolean; error?: string };
    if (!commit.ok) throw new Error(`commit failed: ${commit.error ?? ''}`);
    this.redesignJob = { changeId, job: prepared.job, request: r };
    this.jobs.set(changeId, { job: prepared.job, branch: prepared.branch, findingId: 'redesign' });
    this.base = prepared.branch;
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
      branch: prepared.branch,
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
            branch: prepared.branch,
          },
        },
        { type: 'chat.item', item: { id: itemId, type: 'wording', from: w.from, to: w.to } },
      );
    });
    if (events.length) this.host.emit(events);
    onCommitted();
    const fixed = s.findings.filter((f) => fixedIds.includes(f.id));
    let prNote = '';
    try {
      const pr = (await this.site.fix({
        fn: 'prOpen',
        job: prepared.job,
        title: `Redesign: ${r.direction.name}`,
        body: redesignPrBody({
          ...r,
          summary,
          wording,
          fixed,
          tested: this.testedJobs.has(prepared.job),
        }),
      })) as { number: number; url: string };
      this.change({ ...change, prNumber: pr.number, prUrl: pr.url });
      for (const id of fixedIds)
        this.update(id, { status: 'pr-opened', prNumber: pr.number, prUrl: pr.url });
      prNote = ` Pull request #${pr.number} is open.`;
    } catch (e) {
      prNote = ` I couldn’t open its pull request: ${(e as Error).message}`;
    }
    this.host.say(
      `Your site now uses ${r.direction.name}, and every page still works.` +
        (fixed.length ? ` The new look also fixed ${fixed.length} of the problems I found.` : '') +
        prNote,
    );
  }

  /** "Undo this" on one wording card: just that line goes back, on the redesign's branch. */
  async decideWording(itemId: string, decision: 'keep' | 'undo'): Promise<boolean> {
    const w = this.wording.get(itemId);
    const rj = this.redesignJob;
    if (!w || !rj) return false;
    if (decision === 'keep') return true;
    const back = (await this.site.fix({
      fn: 'patch',
      job: rj.job,
      path: w.path,
      find: w.to,
      replace: w.from,
    })) as { ok: boolean; error?: string };
    if (!back.ok) throw new Error(back.error ?? 'the text changed since');
    const commit = (await this.site.fix({
      fn: 'commit',
      job: rj.job,
      message: `Keep the original wording “${w.from}” (Fitts)`,
    })) as { ok: boolean; error?: string };
    if (!commit.ok) throw new Error(`commit failed: ${commit.error ?? ''}`);
    if (this.host.state().changes.find((c) => c.id === rj.changeId)?.prNumber !== undefined)
      await this.site.fix({ fn: 'push', job: rj.job });
    const c = this.host.state().changes.find((x) => x.id === w.changeId);
    if (c) this.change({ ...c, status: 'undone' });
    return true;
  }

  /** True while there's a verified redesign that "Adjust it" can change. */
  get canAdjust(): boolean {
    const c = this.host.state().changes.find((x) => x.id === this.redesignJob?.changeId);
    return Boolean(c && c.status === 'verified' && !this.redesigning);
  }

  /** "Adjust it": the redesigner changes what the user asked, verified like the first pass. */
  async adjust(text: string): Promise<void> {
    const rj = this.redesignJob;
    const redesigner = this.redesigner;
    if (!rj || !redesigner || !this.canAdjust) return;
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
        this.redesignTools(rj.job),
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
        job: rj.job,
        routes: r.routes,
        ...(r.size ? { size: r.size } : {}),
      })) as VerifyPagesResult;
      let reason = judgeRedesign(after, (route) => this.host.baseline(route));
      const baseline = await (this.testBaselines.get('HEAD') ??
        Promise.resolve({ ran: false, ok: true, summary: '' }));
      if (reason === null) reason = await this.testsAfter(rj.job, baseline);
      if (reason !== null) {
        await this.site.fix({ fn: 'reset', job: rj.job });
        this.host.say(`I undid that adjustment: ${reason}. The redesign is as it was.`);
        return;
      }
      const commit = (await this.site.fix({
        fn: 'commit',
        job: rj.job,
        message: `Adjust the redesign: ${text.slice(0, 60)} (Fitts)`,
      })) as { ok: boolean; error?: string };
      if (!commit.ok) throw new Error(`commit failed: ${commit.error ?? ''}`);
      const c = this.host.state().changes.find((x) => x.id === rj.changeId);
      if (c?.prNumber !== undefined) await this.site.fix({ fn: 'push', job: rj.job });
      const pages = await this.afterShots(after, r);
      if (c) this.change({ ...c, pages, costUsd: this.host.costOf('redesign') });
      this.host.say(
        `Done: ${out.summary || 'adjusted'}${c?.prNumber !== undefined ? ` The pull request #${c.prNumber} is updated.` : ''}`,
      );
    } catch (e) {
      await this.site.fix({ fn: 'reset', job: rj.job }).catch(() => undefined);
      this.host.say(`I couldn’t adjust it: ${(e as Error).message}`);
    } finally {
      this.redesigning = false;
      this.emitCount();
      this.pump();
      this.host.emit([{ type: 'activity.changed', activity: this.host.restingActivity() }]);
      if (!this.busy) this.host.idle();
    }
  }

  /** Redo of an undone change: its branch is still here, so it gets a new PR. */
  private async reopen(c: Change): Promise<void> {
    const j = this.jobs.get(c.id);
    const f = this.host.state().findings.find((x) => x.id === j?.findingId);
    if (!j || !f) return;
    const check = this.checks.get(f.id);
    try {
      const pr = (await this.site.fix({
        fn: 'prOpen',
        job: j.job,
        title: f.title,
        body: prBody(f, check, ''),
      })) as { number: number; url: string };
      this.change({ ...c, status: 'verified', prNumber: pr.number, prUrl: pr.url });
      this.update(f.id, { status: 'pr-opened', prNumber: pr.number, prUrl: pr.url });
    } catch (e) {
      this.host.say(`I couldn’t reopen that pull request: ${(e as Error).message}`);
    }
  }

  /** FINALIZE: verified branches merged into `fitts/preview-<runId>` (§9.4). */
  async preview(): Promise<string | undefined> {
    const branches = this.host
      .state()
      .changes.filter((c) => c.status === 'verified' && c.branch)
      .map((c) => c.branch ?? '');
    if (branches.length === 0) return undefined;
    const res = (await this.site.fix({
      fn: 'preview',
      runId: this.host.state().runId,
      branches,
    })) as {
      branch: string;
    };
    return res.branch;
  }
}
