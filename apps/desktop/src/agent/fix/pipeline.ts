// The fix pipeline (SPEC-phase2 §9): at most 2 jobs at a time. Each job gets a worktree, runs the
// fixer, then is verified on the worktree's own dev server: the finding's probe must stop
// reporting the problem and no new severity ≥2 problems may appear on that route. Only then is
// it committed (and its PR opened, per mode); otherwise it's rolled back with a reason. Undo
// closes the PR (or opens a revert PR when it was merged); retry runs the job again.
import type {
  Change,
  Finding,
  Mode,
  ProbeItem,
  ProbeName,
  ProbeResult,
  RunEvent,
  RunState,
} from '@fitts/schema';
import { PAGE_PROBES } from '@fitts/probes';
import type { VerifyResult } from '../protocol';
import { impactOf, titleOf, type Check } from '../review/aggregate';
import type { Site } from '../site-client';
import { taskFile, type FixTools } from './fixer';

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
}

export type Fixer = (
  task: string,
  tools: FixTools,
  opts: { findingId: string; onStep: (line: string) => void },
) => Promise<{ patched: number; summary: string }>;

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

/** A probe result's problems as `probe|title` keys, with their impact. */
function problems(probe: ProbeName, items: ProbeItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) out.set(`${probe}|${titleOf(probe, i)}`, impactOf(probe, i));
  return out;
}

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
export function prBody(f: Finding, check: Check | undefined, summary: string): string {
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
      ? `Re-ran the ${check.probe} probe on ${check.routes[0] ?? f.route} against this branch's dev server: “${check.title}” is gone, and no new problems at severity 2 or higher appeared (360, 768 and 1280px).`
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

  constructor(
    private readonly host: PipelineHost,
    private readonly site: Site,
    private readonly fixer: Fixer,
    private readonly checks: Map<string, Check>,
  ) {}

  /** Findings with a check Fitts can run (the others need a person to verify). */
  fixable(findingIds: string[]): string[] {
    return findingIds.filter((id) => {
      const check = this.checks.get(id);
      return check !== undefined && VERIFIABLE.has(check.probe);
    });
  }

  get busy(): boolean {
    return this.running > 0 || this.queue.length > 0;
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
    while (this.running < MAX_FIX_JOBS && this.queue.length > 0) {
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
    if (!f || !check) return;
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
      })) as { job: string; branch: string };
      job = prepared.job;
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
        body: prBody(f, check, summary),
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
