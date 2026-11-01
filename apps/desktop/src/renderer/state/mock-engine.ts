// Phase 1 RunEngine: plays scripted scenarios against a ticking clock (SPEC §9.3).
import type { Brief, EdgeStateKind, Mode, RunActivity, RunEngine, RunState } from '@fitts/schema';
import { copy } from '../copy';
import { format } from '../lib/format';
import type { Beat, BeatContext, ChatItemInput, Handler, MockProfile, Scenario } from './script';

export type Speed = 1 | 2 | 4;

export const TICK_MS = 250;
/** Fitts's reply delay after a user message, with the typing indicator (§6.3). */
export const REPLY_MS = 900;
/** "Try again" resolves after 3s (§6.8). */
export const RETRY_MS = 3000;
/** How long a fix takes in run time when the script doesn't say. */
export const FIX_MS = 8000;
import { API_RETRY_MS } from '../lib/timing';
export { API_RETRY_MS };

const isAuto = (mode: Mode) => mode === 'autonomous' || mode === 'dangerous';
const isAsk = (mode: Mode) => mode === 'ask-every' || mode === 'ask-unsure';

interface Hold {
  /** Mirrors RunState.waitingFor: `question:<id>`, `gate` or `approval`. */
  key: string;
  kind: 'question' | 'gate' | 'fixes' | 'directions';
  itemId?: string;
  resolve: (value: unknown, s: RunState, ctx: BeatContext) => void;
  /** The answer used when the Scenario panel fast-forwards past this hold. */
  auto: () => unknown;
}

interface Job {
  atMs: number;
  order: number;
  run: (s: RunState, ctx: BeatContext) => void;
}

class Controller {
  state: RunState;
  script: Scenario | null = null;
  cursor = 0;
  held: Hold | null = null;
  handlers = new Map<string, Handler>();
  jobs: Job[] = [];
  timers = new Set<ReturnType<typeof setTimeout>>();
  /** The activity to return to after a pause or a hold. */
  resumeTo: RunActivity = 'acting';
  interviewStep = 0;
  runNumber: number;
  seq = 0;

  constructor(
    readonly profile: MockProfile,
    mode: Mode,
  ) {
    this.runNumber = profile.runNumber;
    this.state = blankRun(profile.projectId, this.runNumber, mode, {});
  }

  nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}

/** 3 for "run-3"; 0 for none. */
const runNumberOf = (runId: string | undefined) =>
  Number(/^run-(\d+)$/.exec(runId ?? '')?.[1] ?? 0);

function blankRun(projectId: string, runNumber: number, mode: Mode, brief: Brief): RunState {
  return {
    runId: `run-${runNumber}`,
    projectId,
    phase: 'interview',
    activity: 'idle',
    mode,
    step: 0,
    stepEstimate: 120,
    elapsedMs: 0,
    routes: [],
    controlsTried: { done: 0, total: 24 },
    findings: [],
    changes: [],
    chat: [],
    queued: [],
    overlays: { problems: [] },
    fixingCount: 0,
    cost: {
      spentUsd: 0,
      capUsd: 20,
      byPhase: { fixes: 0, reviewers: 0, crawling: 0, summing: 0, media: 0 },
    },
    brief: { ...brief },
    fittsTyping: false,
    driverClicks: [],
  };
}

export interface MockRunEngineOptions {
  /** Script and fixtures for a project; unknown projects get a generic profile. */
  profileFor: (projectId: string) => MockProfile;
  /** The project's saved brief, used when it has no run yet. */
  briefFor?: (projectId: string) => Brief;
  /** The project's last run ("run-3"), so a new run never reuses its id and branches. */
  lastRunFor?: (projectId: string) => string | undefined;
}

/**
 * Implements RunEngine over scripted beats. A shared ticker advances every acting run,
 * including runs in projects that aren't on screen. Gating beats hold the script until
 * the user acts. Methods outside RunEngine are dev controls for the Scenario panel.
 */
export class MockRunEngine implements RunEngine {
  private readonly runs = new Map<string, Controller>();
  private readonly listeners = new Map<string, Set<(s: RunState) => void>>();
  private readonly allListeners = new Set<(projectId: string, s: RunState) => void>();
  private ticker: ReturnType<typeof setInterval> | undefined;
  private speed: Speed = 1;

  constructor(private readonly options: MockRunEngineOptions) {}

  // ── RunEngine: reading ──────────────────────────────────────────────────────

  getState(projectId: string): RunState | undefined {
    return this.runs.get(projectId)?.state;
  }

  subscribe(projectId: string, fn: (s: RunState) => void): () => void {
    let set = this.listeners.get(projectId);
    if (!set) {
      set = new Set();
      this.listeners.set(projectId, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  /** Every run's updates, for the run store. Not part of RunEngine. */
  subscribeAll(fn: (projectId: string, s: RunState) => void): () => void {
    this.allListeners.add(fn);
    return () => this.allListeners.delete(fn);
  }

  // ── RunEngine: interview ────────────────────────────────────────────────────

  /**
   * New run after a real one (the agent ran the audit itself): the next run number, the brief
   * kept, and Fitts opens by asking what this run is for instead of what the site is.
   */
  startNextRun(projectId: string, last: RunState, opener: string, replies: string[] = []): void {
    const ctrl = this.ensure(projectId);
    ctrl.runNumber = Math.max(ctrl.runNumber, runNumberOf(last.runId)) + 1;
    this.resetController(ctrl);
    ctrl.state = blankRun(projectId, ctrl.runNumber, last.mode, { ...last.brief });
    ctrl.interviewStep = ctrl.profile.interview.length;
    this.mutate(ctrl, (_s, ctx) => {
      ctx.say(opener);
      ctx.post({ type: 'brief' });
      if (replies.length) ctx.post({ type: 'quick-replies', options: replies });
    });
  }

  /** One line from Fitts in the run's chat (the agent's notes, like "your site isn't up"). */
  note(projectId: string, text: string): void {
    this.mutate(this.ensure(projectId), (_s, ctx) => ctx.say(text));
  }

  startInterview(projectId: string): void {
    const previous = this.runs.get(projectId);
    const ctrl = previous ?? this.create(projectId);
    const saved = this.options.briefFor?.(projectId) ?? {};
    const brief = previous?.state.brief ?? saved;
    // A finished run, or a project with a saved brief, starts with "Anything changed?".
    const returning =
      (previous !== undefined && previous.state.phase === 'done') ||
      (previous === undefined && Object.values(saved).some(Boolean));
    if (returning && previous) ctrl.runNumber += 1;
    this.resetController(ctrl);
    ctrl.state = blankRun(projectId, ctrl.runNumber, ctrl.state.mode, returning ? brief : {});
    ctrl.interviewStep = returning ? ctrl.profile.interview.length : 0;
    this.mutate(ctrl, (_s, ctx) => {
      ctx.say(
        returning
          ? copy.fitts.interviewAgain
          : ctrl.profile.userFirstName
            ? format(copy.fitts.interviewOpener, { name: ctrl.profile.userFirstName })
            : copy.fitts.interviewOpenerNoName,
      );
      ctx.post({ type: 'brief' });
    });
  }

  answerInterview(projectId: string, text: string): void {
    this.interviewAnswer(projectId, text, {});
  }

  /** Interview answers keep the spoken tag when they came from hold-to-talk. */
  private interviewAnswer(projectId: string, text: string, opts: { spoken?: boolean }) {
    const ctrl = this.ensure(projectId);
    if (ctrl.state.phase !== 'interview') {
      this.sendMessage(projectId, text, opts);
      return;
    }
    this.mutate(ctrl, (s, ctx) => {
      ctx.post({ type: 'user.message', text, ...opts });
      markQuickRepliesUsed(s);
      const step = ctrl.profile.interview[ctrl.interviewStep];
      if (step) {
        Object.assign(s.brief, step.fill(text));
        ctrl.interviewStep += 1;
      }
      s.fittsTyping = true;
      ctx.after(REPLY_MS, (s2, ctx2) => {
        s2.fittsTyping = false;
        if (step) step.reply(s2, ctx2);
        else ctx2.say(copy.fitts.ack);
      });
    });
  }

  // ── Phase 2 agent: the real interview (SPEC-phase2 §6.2) ──────────────────────
  // The agent asks the model; this engine keeps the interview's state, so the opener, the brief
  // card and the ready bar work as in Phase 1.

  /** Posts the user's answer and shows Fitts typing. False when the run isn't interviewing. */
  interviewUser(
    projectId: string,
    text: string,
    opts: { spoken?: boolean; pointingAt?: string; pointingLabel?: string } = {},
  ): boolean {
    const ctrl = this.ensure(projectId);
    if (ctrl.state.phase !== 'interview') return false;
    this.mutate(ctrl, (s, ctx) => {
      ctx.post({
        type: 'user.message',
        text,
        ...(opts.spoken ? { spoken: true } : {}),
        ...(opts.pointingAt ? { pointingAt: opts.pointingAt } : {}),
        ...(opts.pointingLabel ? { pointingLabel: opts.pointingLabel } : {}),
      });
      markQuickRepliesUsed(s);
      s.fittsTyping = true;
    });
    return true;
  }

  /** Fitts's reply from the model: brief fields, the next line, and quick replies. */
  interviewReply(
    projectId: string,
    reply: { say: string; fields: Partial<Brief>; quickReplies: string[] },
  ): void {
    const ctrl = this.ensure(projectId);
    this.mutate(ctrl, (s, ctx) => {
      s.fittsTyping = false;
      for (const [k, v] of Object.entries(reply.fields))
        if (typeof v === 'string' && v.trim()) s.brief[k as keyof Brief] = v.trim();
      ctrl.interviewStep += 1;
      ctx.say(reply.say);
      if (reply.quickReplies.length > 0)
        ctx.post({ type: 'quick-replies', options: reply.quickReplies });
    });
  }

  /** The scripted step, when the model can't answer (no key, offline, an error). */
  interviewFallback(projectId: string, text: string): void {
    const ctrl = this.ensure(projectId);
    this.mutate(ctrl, (s, ctx) => {
      s.fittsTyping = false;
      const step = ctrl.profile.interview[ctrl.interviewStep];
      if (step) {
        Object.assign(s.brief, step.fill(text));
        ctrl.interviewStep += 1;
        step.reply(s, ctx);
      } else ctx.say(copy.fitts.ack);
    });
  }

  // ── RunEngine: run control ──────────────────────────────────────────────────

  startAudit(projectId: string): void {
    const ctrl = this.ensure(projectId);
    this.mutate(ctrl, (s, ctx) => this.beginAudit(ctrl, s, ctx));
  }

  pause(projectId: string): void {
    this.withRun(projectId, (_s, ctx) => ctx.pause());
  }

  resume(projectId: string): void {
    this.withRun(projectId, (_s, ctx) => ctx.resume());
  }

  stopAction(projectId: string): void {
    this.withRun(projectId, (s, ctx) => {
      if (s.phase !== 'audit') return;
      s.nowText = undefined;
      s.overlays.attention = undefined;
      this.postEdgeState(s, ctx, 'stopped');
    });
  }

  stopRun(projectId: string): void {
    this.withRun(projectId, (s, ctx) => {
      if (s.phase !== 'audit') return;
      this.postEdgeState(s, ctx, 'stop-run-confirm');
    });
  }

  takeWheel(projectId: string): void {
    this.withRun(projectId, (_s, ctx) => ctx.takeWheel());
  }

  handBack(projectId: string): void {
    this.withRun(projectId, (s, ctx) => {
      if (s.activity !== 'user-driving') return;
      const clicks = s.driverClicks;
      s.driverClicks = [];
      if (clicks.length > 0) {
        ctx.post({
          type: 'steps',
          steps: clicks.map((label) => ({ label: `You clicked ${label}`, costUsd: 0 })),
        });
      }
      const path = clicks.length > 0 ? clicks.join(' → ') : copy.fitts.handBackNoPath;
      s.activity = 'paused';
      ctx.resume();
      ctx.ask(
        {
          text: format(copy.fitts.handBack, { path }),
          options: [copy.fitts.pathYes, copy.fitts.pathNo],
          blocking: false,
        },
        (answer, _s2, ctx2) => {
          if (answer !== copy.fitts.pathYes) return;
          ctx2.post({
            type: 'progress',
            title: copy.fitts.testingPath,
            items: clicks.map((label, i) => ({ text: label, state: i === 0 ? 'doing' : 'todo' })),
          });
        },
      );
    });
  }

  sendMessage(
    projectId: string,
    text: string,
    opts: { pointingAt?: string; pointingLabel?: string; spoken?: boolean } = {},
  ): void {
    const ctrl = this.ensure(projectId);
    if (ctrl.state.phase === 'interview' && !opts.pointingAt) {
      this.interviewAnswer(projectId, text, opts.spoken ? { spoken: true } : {});
      return;
    }
    this.mutate(ctrl, (s, ctx) => {
      ctx.post({ type: 'user.message', text, ...opts });
      // Mid-action messages wait for the current step (§7.2).
      if (s.phase === 'audit' && (s.activity === 'acting' || s.activity === 'redesigning')) {
        s.queued.push(text);
        return;
      }
      this.reply(s, ctx, copy.fitts.ack);
    });
  }

  interruptNow(projectId: string): void {
    this.withRun(projectId, (s, ctx) => {
      if (s.queued.length === 0) return;
      s.nowText = undefined;
      s.overlays.attention = undefined;
      s.queued = [];
      this.reply(s, ctx, copy.fitts.ack);
    });
  }

  answerQuestion(projectId: string, itemId: string, answer: string): void {
    this.withRun(projectId, (s, ctx) => {
      const ctrl = this.ensure(projectId);
      if (ctrl.held?.key === `question:${itemId}`) this.release(ctrl, s);
      this.applyAnswer(ctrl, s, ctx, itemId, answer);
    });
  }

  /** Records the answer on a question or edge-state card once, then runs its handler. */
  private applyAnswer(
    ctrl: Controller,
    s: RunState,
    ctx: BeatContext,
    itemId: string,
    answer: string,
  ) {
    const item = s.chat.find((c) => c.id === itemId);
    if (item?.type !== 'question' && item?.type !== 'state') return;
    if (item.answer !== undefined) return;
    item.answer = answer;
    const handler = ctrl.handlers.get(itemId);
    ctrl.handlers.delete(itemId);
    handler?.(answer, s, ctx);
  }

  approveFixes(projectId: string, findingIds: string[]): void {
    this.withRun(projectId, (s, ctx) => {
      const ctrl = this.ensure(projectId);
      if (ctrl.held?.kind === 'fixes') {
        this.resolveHold(ctrl, s, ctx, findingIds);
        return;
      }
      // A single "Fix it" from the Finding panel.
      ctx.startFixes(findingIds.filter((id) => isOpen(s, id)));
    });
  }

  dismissFinding(projectId: string, findingId: string): void {
    this.withRun(projectId, (s, ctx) => {
      const finding = s.findings.find((f) => f.id === findingId);
      if (!finding) return;
      finding.status = 'dismissed';
      s.overlays.problems = s.overlays.problems.filter((p) => p.ref !== finding.elementRef);
      ctx.say(copy.fitts.dismissFollowUp);
    });
  }

  /** The scripted run has no live site: "Replay it" rewinds to the step, as in Phase 1. */
  showFinding(projectId: string, findingId: string): void {
    const step = this.getState(projectId)?.findings.find((f) => f.id === findingId)?.stepIndex;
    if (step !== undefined) this.rewindTo(projectId, step);
  }

  reopenFinding(projectId: string, findingId: string): void {
    this.withRun(projectId, (s) => {
      const finding = s.findings.find((f) => f.id === findingId);
      if (finding?.status === 'dismissed') finding.status = 'open';
    });
  }

  respondGate(projectId: string, gateId: string, decision: 'deny' | 'other' | 'allow'): void {
    this.withRun(projectId, (s, ctx) => {
      const ctrl = this.ensure(projectId);
      if (s.gate?.id !== gateId || ctrl.held?.kind !== 'gate') return;
      this.resolveHold(ctrl, s, ctx, decision);
    });
  }

  setMode(projectId: string, mode: Mode): void {
    // Takes effect at Fitts's next action: beats read the mode when they play.
    this.withRun(projectId, (s) => {
      s.mode = mode;
    });
  }

  pickDirection(projectId: string, directionId: string): void {
    this.withRun(projectId, (s, ctx) => {
      const item = [...s.chat].reverse().find((c) => c.type === 'directions');
      if (item?.type !== 'directions') return;
      item.selectedId = directionId;
      const ctrl = this.ensure(projectId);
      if (ctrl.held?.kind === 'directions') this.resolveHold(ctrl, s, ctx, directionId);
    });
  }

  decideWording(projectId: string, itemId: string, decision: 'keep' | 'undo'): void {
    this.withRun(projectId, (s) => {
      const item = s.chat.find((c) => c.id === itemId);
      if (item?.type !== 'wording') return;
      item.decision = decision;
      const change = s.changes.find((c) => c.kind === 'wording' && c.title.includes(item.to));
      if (change) change.status = decision === 'undo' ? 'undone' : 'verified';
    });
  }

  undoChange(projectId: string, changeId: string): void {
    this.withRun(projectId, (s) => {
      const change = s.changes.find((c) => c.id === changeId);
      if (!change) return;
      change.status = 'undone';
      // Undone after the run's PR was merged: a revert PR (§9.4); the mock numbers it +9.
      if (change.merged && change.prNumber !== undefined)
        change.revertPrNumber = change.prNumber + 9;
      for (const f of s.findings) if (change.findingIds.includes(f.id)) f.status = 'undone';
    });
  }

  retryChange(projectId: string, changeId: string): void {
    this.withRun(projectId, (s, ctx) => {
      const change = s.changes.find((c) => c.id === changeId);
      if (!change) return;
      const previous = change.status;
      change.status = 'retrying';
      ctx.after(RETRY_MS, (s2) => {
        const c = s2.changes.find((x) => x.id === changeId);
        if (c?.status !== 'retrying') return;
        c.status = 'verified';
        c.reason = undefined;
        // A rolled-back change never had a PR; the retry joins the run's one.
        c.prNumber ??= s2.changes.find((x) => x.prNumber !== undefined)?.prNumber ?? 1;
        for (const f of s2.findings) {
          if (c.findingIds.includes(f.id))
            f.status = previous === 'undone' ? 'pr-opened' : 'verified';
        }
      });
    });
  }

  rewindTo(projectId: string, stepIndex: number | null): void {
    this.withRun(projectId, (s) => {
      s.rewindStep = stepIndex ?? undefined;
    });
  }

  updateBrief(projectId: string, brief: Brief): void {
    const ctrl = this.ensure(projectId);
    this.mutate(ctrl, (s, ctx) => {
      s.brief = { ...brief };
      ctx.say(copy.fitts.briefSaved);
    });
  }

  // ── Dev controls (Scenario panel only) ──────────────────────────────────────

  setSpeed(speed: Speed): void {
    this.speed = speed;
  }

  getSpeed(): Speed {
    return this.speed;
  }

  /** The current scenario's beats and how far the script has got. */
  getScript(projectId: string): { beats: Pick<Beat, 'id' | 'label' | 'atMs'>[]; cursor: number } {
    const ctrl = this.runs.get(projectId);
    const beats = ctrl?.script?.beats ?? [];
    return {
      beats: beats.map(({ id, label, atMs }) => ({ id, label, atMs })),
      cursor: ctrl?.cursor ?? 0,
    };
  }

  /** Forgets every run. */
  reset(): void {
    for (const ctrl of this.runs.values()) this.resetController(ctrl);
    this.runs.clear();
  }

  /** Starts a fresh audit in `mode`, optionally with the profile's brief filled in. */
  loadAudit(projectId: string, mode: Mode): void {
    const ctrl = this.create(projectId, mode);
    ctrl.state.brief = { ...defaultBrief(ctrl.profile) };
    this.startAudit(projectId);
  }

  /** Restarts the scenario and plays it up to and including beat `index`. */
  jumpToBeat(projectId: string, index: number): void {
    const existing = this.runs.get(projectId);
    const mode = existing?.state.mode ?? this.profile(projectId).defaultMode;
    const ctrl = this.create(projectId, mode);
    ctrl.state.brief = { ...defaultBrief(ctrl.profile) };
    this.mutate(ctrl, (s, ctx) => {
      this.beginAudit(ctrl, s, ctx, { play: false });
      const target = ctrl.profile.audit.beats[index];
      if (!target) return;
      // Earlier holds resolve with their default answers; the target's hold stays open.
      while (ctrl.cursor <= index && s.phase === 'audit') {
        if (ctrl.held) this.resolveHold(ctrl, s, ctx, ctrl.held.auto());
        const before = ctrl.cursor;
        const atMs = ctrl.profile.audit.beats[ctrl.cursor]?.atMs ?? target.atMs;
        s.elapsedMs = Math.max(s.elapsedMs, atMs);
        this.play(ctrl, s, ctx, { untilCursor: index + 1 });
        if (ctrl.cursor === before && !ctrl.held) break;
        if (ctrl.cursor > index) break;
      }
      updateProgress(s);
    });
  }

  restart(projectId: string): void {
    const ctrl = this.runs.get(projectId);
    if (!ctrl) return;
    if (ctrl.state.phase === 'interview') this.startInterview(projectId);
    else this.loadAudit(projectId, ctrl.state.mode);
  }

  /** The mock site reports each click while the user has the wheel (§7.3). */
  recordUserClick(projectId: string, label: string): void {
    this.withRun(projectId, (s) => {
      if (s.activity === 'user-driving') s.driverClicks.push(label);
    });
  }

  /** Posts one of the §7.7 edge-state cards on the current run. */
  /** Phase 2 stub agent: the run's spending cap from Settings (SPEC-phase2 §11). */
  setCap(projectId: string, capUsd: number): void {
    this.withRun(projectId, (s) => {
      s.cost.capUsd = capUsd;
    });
  }

  showEdgeState(projectId: string, kind: EdgeStateKind): void {
    this.withRun(projectId, (s, ctx) => this.postEdgeState(s, ctx, kind));
  }

  /** Posts a question on a run; used for the background-project scenario. */
  askOn(projectId: string, text: string, options: string[], blocking: boolean): void {
    this.withRun(projectId, (_s, ctx) => {
      ctx.ask({ text, options, blocking });
    });
  }

  dispose(): void {
    this.reset();
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = undefined;
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private profile(projectId: string) {
    return this.options.profileFor(projectId);
  }

  private create(projectId: string, mode?: Mode): Controller {
    const old = this.runs.get(projectId);
    if (old) this.resetController(old);
    const profile = this.profile(projectId);
    const ctrl = new Controller(profile, mode ?? old?.state.mode ?? profile.defaultMode);
    if (old) ctrl.runNumber = old.runNumber;
    else {
      const last = runNumberOf(this.options.lastRunFor?.(projectId));
      if (last >= ctrl.runNumber) {
        ctrl.runNumber = last + 1;
        ctrl.state = blankRun(projectId, ctrl.runNumber, ctrl.state.mode, {});
      }
    }
    this.runs.set(projectId, ctrl);
    return ctrl;
  }

  private ensure(projectId: string): Controller {
    return this.runs.get(projectId) ?? this.create(projectId);
  }

  private resetController(ctrl: Controller) {
    ctrl.clearTimers();
    ctrl.jobs = [];
    ctrl.held = null;
    ctrl.handlers.clear();
    ctrl.script = null;
    ctrl.cursor = 0;
  }

  private withRun(projectId: string, fn: (s: RunState, ctx: BeatContext) => void) {
    const ctrl = this.runs.get(projectId);
    if (ctrl) this.mutate(ctrl, fn);
  }

  /** Every change edits a copy, then subscribers get the new object. */
  private mutate(ctrl: Controller, fn: (s: RunState, ctx: BeatContext) => void) {
    const draft = structuredClone(ctrl.state);
    fn(draft, this.context(ctrl, draft));
    ctrl.state = draft;
    for (const l of this.listeners.get(ctrl.profile.projectId) ?? []) l(draft);
    for (const l of this.allListeners) l(ctrl.profile.projectId, draft);
  }

  private beginAudit(
    ctrl: Controller,
    s: RunState,
    ctx: BeatContext,
    { play = true }: { play?: boolean } = {},
  ) {
    this.resetController(ctrl);
    markQuickRepliesUsed(s);
    s.phase = 'audit';
    s.activity = 'acting';
    s.elapsedMs = 0;
    s.step = 0;
    s.fittsTyping = false;
    ctrl.resumeTo = 'acting';
    ctrl.script = ctrl.profile.audit;
    this.ensureTicker();
    if (play) this.play(ctrl, s, ctx);
  }

  private ensureTicker() {
    this.ticker ??= setInterval(() => this.tick(), TICK_MS);
  }

  private tick() {
    for (const ctrl of this.runs.values()) {
      const { phase, activity } = ctrl.state;
      if (phase !== 'audit' || ctrl.held) continue;
      if (activity !== 'acting' && activity !== 'redesigning') continue;
      this.mutate(ctrl, (s, ctx) => {
        s.elapsedMs += TICK_MS * this.speed;
        this.play(ctrl, s, ctx);
        updateProgress(s);
      });
    }
  }

  /** Applies due beats and jobs in time order until the script holds or catches up. */
  private play(
    ctrl: Controller,
    s: RunState,
    ctx: BeatContext,
    { untilCursor = Infinity }: { untilCursor?: number } = {},
  ) {
    const beats = ctrl.script?.beats ?? [];
    for (;;) {
      if (ctrl.held || s.phase !== 'audit') return;
      const beat = ctrl.cursor < untilCursor ? beats[ctrl.cursor] : undefined;
      const job = ctrl.jobs.reduce<Job | undefined>(
        (min, j) =>
          !min || j.atMs < min.atMs || (j.atMs === min.atMs && j.order < min.order) ? j : min,
        undefined,
      );
      const beatDue = beat && beat.atMs <= s.elapsedMs;
      const jobDue = job && job.atMs <= s.elapsedMs;
      if (!beatDue && !jobDue) return;
      if (jobDue && (!beatDue || job.atMs < beat.atMs)) {
        ctrl.jobs = ctrl.jobs.filter((j) => j !== job);
        job.run(s, ctx);
        continue;
      }
      if (!beat) return;
      ctrl.cursor += 1;
      // Messages sent mid-action are delivered once the current step ends (§7.2).
      if (s.queued.length > 0) {
        s.queued = [];
        ctx.say(copy.fitts.ack);
      }
      beat.apply(s, ctx);
    }
  }

  private hold(ctrl: Controller, s: RunState, hold: Hold) {
    ctrl.held = hold;
    s.waitingFor = hold.key;
    if (s.activity === 'acting' || s.activity === 'redesigning') {
      ctrl.resumeTo = s.activity;
      s.activity = 'waiting-on-user';
    }
  }

  private release(ctrl: Controller, s: RunState) {
    ctrl.held = null;
    s.waitingFor = undefined;
    if (s.activity === 'waiting-on-user') s.activity = ctrl.resumeTo;
  }

  private resolveHold(ctrl: Controller, s: RunState, ctx: BeatContext, value: unknown) {
    const held = ctrl.held;
    if (!held) return;
    this.release(ctrl, s);
    held.resolve(value, s, ctx);
  }

  private reply(s: RunState, ctx: BeatContext, text: string) {
    s.fittsTyping = true;
    ctx.after(REPLY_MS, (s2, ctx2) => {
      s2.fittsTyping = false;
      ctx2.say(text);
    });
  }

  private postEdgeState(s: RunState, ctx: BeatContext, kind: EdgeStateKind) {
    const ctrl = this.ensure(s.projectId);
    const id = ctx.post({ type: 'state', stateKind: kind });
    const holdOn = () =>
      this.hold(ctrl, s, {
        key: `question:${id}`,
        kind: 'question',
        itemId: id,
        resolve: () => undefined,
        auto: () => undefined,
      });

    switch (kind) {
      case 'stopped':
        ctx.pause();
        ctx.onAnswer(id, (answer, _s2, c) => {
          if (answer === 'wheel') return c.takeWheel();
          if (answer === 'skip') {
            ctrl.cursor = Math.min(ctrl.cursor + 1, ctrl.script?.beats.length ?? 0);
            c.say(copy.fitts.skipped);
          }
          c.resume();
        });
        return;
      case 'stop-run-confirm':
        ctx.pause();
        ctx.onAnswer(id, (answer, s2, c) => {
          if (answer === 'stop') {
            c.finish();
            c.say(format(copy.fitts.stoppedRun, { n: s2.findings.length }));
            return;
          }
          c.say(copy.fitts.keepGoing);
          c.resume();
        });
        return;
      case 'reopen':
        ctx.pause();
        ctx.onAnswer(id, (answer, _s2, c) => {
          if (answer === 'summary') return c.finish();
          c.say(copy.fitts.resumed);
          c.resume();
        });
        return;
      case 'uncommitted':
        holdOn();
        ctx.onAnswer(id, (answer, _s2, c) => {
          if (answer === 'save') return void c.say(copy.fitts.savedChanges);
          c.say(copy.fitts.commitFirst);
          c.pause();
        });
        return;
      case 'login-wall':
        holdOn();
        ctx.onAnswer(id, (answer, _s2, c) => {
          if (answer === 'wheel') return c.takeWheel();
          c.say(answer === 'add-login' ? copy.fitts.loginAdded : copy.fitts.skipped);
        });
        return;
      case 'site-down':
        holdOn();
        ctx.onAnswer(id, (answer, _s2, c) => {
          if (answer === 'restart') return void c.say(copy.fitts.serverRestarted);
          c.say(copy.fitts.waitingForYou);
          c.pause();
        });
        return;
      case 'budget-warning':
        // 80%: a heads-up while there's still room to stretch the budget. The run keeps going.
        s.cost.spentUsd = Math.max(s.cost.spentUsd, Math.round(s.cost.capUsd * 80) / 100);
        ctx.onAnswer(id, (answer, s2, c) => {
          if (answer === 'economy') return void c.say(copy.fitts.budgetEconomy);
          c.say(format(copy.fitts.budgetKeepQuality, { cap: `$${s2.cost.capUsd}` }));
        });
        return;
      case 'budget':
        // 100%: nothing more is spent until the cap goes up.
        s.cost.spentUsd = Math.max(s.cost.spentUsd, s.cost.capUsd);
        holdOn();
        ctx.onAnswer(id, (answer, s2, c) => {
          if (answer === 'stop') return c.finish();
          s2.cost.capUsd += 10;
          c.say(format(copy.fitts.budgetRaised, { cap: `$${s2.cost.capUsd}` }));
        });
        return;
      case 'api-trouble':
        holdOn();
        ctx.onAnswer(id, (answer, _s2, c) => {
          if (answer === 'pause') return c.pause();
          c.say(copy.fitts.apiRecovered);
        });
        ctx.after(API_RETRY_MS, (s2, c) => {
          const card = s2.chat.find((x) => x.id === id);
          if (card?.type !== 'state' || card.answer) return;
          card.answer = 'retry-now';
          if (ctrl.held?.itemId === id) this.release(ctrl, s2);
          ctrl.handlers.delete(id);
          c.say(copy.fitts.apiRecovered);
        });
        return;
      case 'nothing-found':
        // The run has nothing left to do, but stays on the audit screen with the card
        // showing; Stop run takes it to Done.
        s.nowText = undefined;
        s.overlays.attention = undefined;
        // "I checked every page" has to match the counters around it.
        for (const path of ['/', '/about', '/contact']) {
          if (!s.routes.some((r) => r.path === path)) {
            s.routes.push({ path, depth: 0, status: 'done', issues: 0 });
          }
        }
        for (const route of s.routes) route.status = 'done';
        s.elapsedMs = Math.max(s.elapsedMs, 3 * 60_000 + 12_000);
        s.stepEstimate = Math.max(s.step, 46);
        s.step = s.stepEstimate;
        s.controlsTried.done = s.controlsTried.total;
        ctx.pause();
        ctx.onAnswer(id, (answer, _s2, c) => {
          if (answer === 'finish') return c.finish();
          c.post({
            type: 'steps',
            steps: ctrl.profile.checks.map((label) => ({ label, costUsd: 0 })),
          });
          c.say(copy.fitts.checksDone);
        });
        return;
    }
  }

  private context(ctrl: Controller, s: RunState): BeatContext {
    const ctx: BeatContext = {
      get mode() {
        return s.mode;
      },
      get asks() {
        return isAsk(s.mode);
      },
      profile: ctrl.profile,
      post(item: ChatItemInput) {
        const id = ctrl.nextId(item.type.replace('.', '-'));
        s.chat.push({ ...item, id });
        return id;
      },
      say: (text) => ctx.post({ type: 'fitts.message', text }),
      think: (text) => ctx.post({ type: 'fitts.thinking', text }),
      ask: (question, onAnswer) => {
        const id = ctx.post({ type: 'question', ...question });
        if (onAnswer) ctrl.handlers.set(id, onAnswer);
        if (question.blocking) {
          this.hold(ctrl, s, {
            key: `question:${id}`,
            kind: 'question',
            itemId: id,
            // Users answer through answerQuestion; this path is the Scenario panel
            // fast-forwarding with the first option.
            resolve: (value, s2, c) => this.applyAnswer(ctrl, s2, c, id, String(value)),
            auto: () => question.options[0],
          });
        }
        return id;
      },
      onAnswer(itemId, handler) {
        ctrl.handlers.set(itemId, handler);
      },
      requestApproval: (requested, onApproved) => {
        // Findings already being fixed (say, from the Finding panel) aren't asked about again.
        const findingIds = requested.filter((id) => isOpen(s, id));
        if (findingIds.length === 0) return;
        if (isAuto(s.mode)) return onApproved(findingIds, s, ctx);
        if (s.mode === 'plan') {
          ctx.say(format(copy.fitts.planOnlyFixes, { n: findingIds.length }));
          return;
        }
        const serious = s.findings.filter(
          (f) => findingIds.includes(f.id) && f.severity >= 3,
        ).length;
        const itemId = ctx.post({ type: 'approval.batch', findingIds, serious });
        this.hold(ctrl, s, {
          key: 'approval',
          kind: 'fixes',
          itemId,
          resolve: (value, s2, c) => {
            const approved = value as string[];
            const item = s2.chat.find((x) => x.id === itemId);
            if (item?.type === 'approval.batch') item.answer = approved.join(',');
            onApproved(approved, s2, c);
          },
          auto: () => findingIds,
        });
      },
      requestGate: (gate, onDecision) => {
        if (s.mode === 'dangerous') {
          ctx.say(format(copy.fitts.gateSkippedDangerous, { action: gate.action }));
          onDecision?.('allow', s, ctx);
          return;
        }
        s.gate = gate;
        this.hold(ctrl, s, {
          key: 'gate',
          kind: 'gate',
          resolve: (value, s2, c) => {
            const decision = value as 'deny' | 'other' | 'allow';
            s2.gate = undefined;
            c.say(
              decision === 'allow'
                ? copy.fitts.gateAllowed
                : decision === 'other'
                  ? copy.fitts.gateOther
                  : copy.fitts.gateDenied,
            );
            onDecision?.(decision, s2, c);
          },
          auto: () => 'deny',
        });
      },
      offerDirections: (options, autoPickId, onPicked) => {
        const itemId = ctx.post({ type: 'directions', options });
        if (isAuto(s.mode)) {
          const item = s.chat.find((c) => c.id === itemId);
          if (item?.type === 'directions') item.selectedId = autoPickId;
          onPicked(autoPickId, s, ctx);
          return;
        }
        // Plan only proposes; Ask modes wait for a pick (§6.7).
        if (s.mode === 'plan') return;
        this.hold(ctrl, s, {
          key: 'approval',
          kind: 'directions',
          itemId,
          resolve: (value, s2, c) => {
            const item = s2.chat.find((x) => x.id === itemId);
            if (item?.type === 'directions') item.selectedId ??= String(value);
            onPicked(String(value), s2, c);
          },
          auto: () => autoPickId,
        });
      },
      startFixes(findingIds, { doneAtMs, durationMs = FIX_MS } = {}) {
        const startedAuto = isAuto(s.mode);
        findingIds.forEach((id, i) => {
          const finding = s.findings.find((f) => f.id === id);
          if (finding?.status !== 'open') return;
          finding.status = 'fixing';
          s.fixingCount += 1;
          const at = Math.max(doneAtMs?.[i] ?? s.elapsedMs + durationMs, s.elapsedMs);
          ctx.at(at, (s2, c) => {
            s2.fixingCount = Math.max(0, s2.fixingCount - 1);
            const fix = ctrl.profile.fixes[id];
            const title = fix?.title ?? finding.title;
            // Fixes started in Autonomous ask before pushing once the mode has changed (§7.1).
            if (startedAuto && !isAuto(s2.mode)) {
              c.ask(
                {
                  text: format(copy.fitts.pushReady, { title }),
                  options: [copy.fitts.pushYes, copy.fitts.pushNo],
                  blocking: false,
                },
                (answer, s3, c3) => {
                  if (answer === copy.fitts.pushYes) publishFix(s3, c3, id);
                },
              );
              const f = s2.findings.find((x) => x.id === id);
              if (f) f.status = 'verified';
              return;
            }
            publishFix(s2, c, id);
          });
        });
      },
      at(atMs, fn) {
        ctrl.jobs.push({ atMs, order: ctrl.seq++, run: fn });
      },
      after: (ms, fn) => {
        const timer = setTimeout(() => {
          ctrl.timers.delete(timer);
          this.mutate(ctrl, fn);
        }, ms / this.speed);
        ctrl.timers.add(timer);
      },
      finish() {
        ctrl.held = null;
        ctrl.jobs = [];
        s.waitingFor = undefined;
        s.phase = 'done';
        s.activity = 'idle';
        s.nowText = undefined;
        s.gate = undefined;
        s.queued = [];
        s.fittsTyping = false;
        s.overlays = { problems: s.overlays.problems };
        s.fixingCount = 0;
        for (const f of s.findings) if (f.status === 'fixing') f.status = 'open';
      },
      pause() {
        if (s.activity === 'acting' || s.activity === 'redesigning') ctrl.resumeTo = s.activity;
        if (s.activity !== 'idle' && s.activity !== 'user-driving') s.activity = 'paused';
      },
      resume() {
        if (s.activity !== 'paused' && s.activity !== 'user-driving') return;
        s.activity = ctrl.held ? 'waiting-on-user' : ctrl.resumeTo;
      },
      takeWheel() {
        if (s.phase !== 'audit' || s.activity === 'user-driving') return;
        if (s.activity === 'acting' || s.activity === 'redesigning') ctrl.resumeTo = s.activity;
        s.activity = 'user-driving';
        // Driving happens in the live site, never in a rewound moment.
        s.rewindStep = undefined;
        s.nowText = undefined;
        s.overlays.attention = undefined;
        s.driverClicks = [];
        ctx.post({ type: 'driving' });
      },
    };

    function publishFix(s2: RunState, c: BeatContext, findingId: string) {
      const finding = s2.findings.find((f) => f.id === findingId);
      if (!finding) return;
      // One PR per run (§9.3): every fix shares the profile's number.
      const fix = ctrl.profile.fixes[findingId] ?? {
        title: finding.title,
        prNumber: Object.values(ctrl.profile.fixes)[0]?.prNumber ?? 12,
        costUsd: 0.4,
      };
      const changeId = ctrl.nextId('change');
      s2.changes.push({
        id: changeId,
        findingIds: [findingId],
        kind: 'fix',
        title: fix.title,
        severity: finding.severity,
        prNumber: fix.prNumber,
        costUsd: fix.costUsd,
        status: 'verified',
      });
      finding.status = 'pr-opened';
      finding.prNumber = fix.prNumber;
      finding.costUsd = fix.costUsd;
      s2.cost.spentUsd = round2(s2.cost.spentUsd + fix.costUsd);
      s2.cost.byPhase.fixes = round2(s2.cost.byPhase.fixes + fix.costUsd);
      c.post({ type: 'fix.result', changeId });
    }

    return ctx;
  }
}

function isOpen(s: RunState, findingId: string) {
  return s.findings.find((f) => f.id === findingId)?.status === 'open';
}

function markQuickRepliesUsed(s: RunState) {
  for (const item of s.chat) if (item.type === 'quick-replies') item.used = true;
}

/** Step counter and "Controls tried" follow run time (§6.4 footer and site map). */
function updateProgress(s: RunState) {
  s.step = Math.min(s.stepEstimate, Math.round(s.elapsedMs / 750));
  s.controlsTried.done = Math.min(s.controlsTried.total, Math.floor(s.elapsedMs / 2200));
}

function defaultBrief(profile: MockProfile): Brief {
  const brief: Brief = {};
  for (const step of profile.interview) Object.assign(brief, step.fill(''));
  return brief;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
