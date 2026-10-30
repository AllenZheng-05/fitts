// The real audit (SPEC-phase2 §6): CRAWL as a step loop over the user's live site, with the
// coverage gate, stop/pause/queue, take the wheel, and edge states from real conditions.
// Probes (P5) run alongside it; reviewers (P6), the gate (P8) and fixes (P9) plug into this loop later.
import {
  reduce,
  type ChatItem,
  type Finding,
  type EdgeStateKind,
  type Mode,
  type RunEvent,
  type RunState,
} from '@fitts/schema';
import type { BudgetGuard } from '../ledger/budget';
import type { CostLedger } from '../ledger/ledger';
import type { AxSnapshot, HeldRequest } from '../protocol';
import type { Site } from '../site-client';
import type { Action, Brain } from '../crawler/brain';
import { Coverage, DESTRUCTIVE, routeOf } from '../crawler/coverage';
import { copy } from '../../renderer/copy';
import { format } from '../../renderer/lib/format';
import { ProbeRunner } from '../crawler/probes';
import { aggregateWithChecks, type Check } from '../review/aggregate';
import { FixPipeline, type Fixer } from '../fix/pipeline';
import type { ReviewerPanel, RouteEvidence } from '../review/reviewers';
import type { Direction, ThemeFit } from '../review/themefit';

/** api-trouble retries on its own after this long (§6.3). */
export const API_RETRY_MS = 12_000;
/** A run never takes more steps than this (§6.1). */
export const MAX_STEPS = 200;

export interface RunDeps {
  site: Site;
  brain: Brain;
  ledger: CostLedger;
  budget: BudgetGuard;
  origin: string;
  /** Sends events for this run (main logs and forwards them). */
  emit: (events: RunEvent[]) => void;
  /** "Switch to Economy" on the 80% card. */
  onEconomy?: () => void;
  /** Pause between actions, so the ghost cursor can travel (ms). */
  actionDelayMs?: number;
  /** The reviewer panel (§8). Without one (no key, offline), probe findings stand alone. */
  panel?: ReviewerPanel;
  /** The fixer (§9.2): without one (no key, offline), findings aren't fixed. */
  fixer?: Fixer;
  /** Theme-fit (§8.3), asked once after the first 3 routes. */
  themeFit?: (
    input: { brief: RunState['brief']; shots: string[]; inventory: string[] },
    signal?: AbortSignal,
  ) => Promise<ThemeFit>;
}

/** Theme-fit looks at this many routes' screenshots (§8.3). */
const THEME_ROUTES = 3;

/** Routes reviewed at once (§8.1: at most 2 in flight, 5 reviewers each). */
const ROUTES_IN_FLIGHT = 2;

const LOGIN = /\b(log ?in|sign ?in)\b|\/(login|signin|sign-in|auth)\b/i;

export class RealRun {
  state: RunState;
  readonly coverage: Coverage;
  readonly probes: ProbeRunner;
  private items = 0;
  private finished = false;
  private wake: (() => void) | undefined;
  private abort = new AbortController();
  private readonly history: string[] = [];
  private readonly handlers = new Map<string, (answer: string) => void>();
  private clock: ReturnType<typeof setInterval> | undefined;
  /** A failed action's control, so a stubborn element can't loop forever. */
  private failures = 0;
  private lastRoutes = '';
  /** Controls that showed an error, tried again once the crawl next arrives on their route. */
  private readonly retryOn = new Map<string, Set<string>>();
  private readonly retried = new Set<string>();
  /** What the reviewer panel gets for each route, and when Fitts was first there. */
  private themeAsked = false;
  /** The fix pipeline (§9), once findings exist and the project is its own git repo. */
  private pipeline: FixPipeline | undefined;
  private checks = new Map<string, Check>();
  /** An approval card is open, or fixes are running: the run finishes when they settle. */
  private fixPhase = false;
  private approvalId: string | undefined;
  private finalized = false;
  /** The open "Can I …?" question (Ask every action), resolved false if the run moves on. */
  private pendingAsk: ((ok: boolean) => void) | undefined;
  /** The request the gate modal is holding, and the action that sent it (§13). */
  private heldReq: { held: HeldRequest; gateId: string } | undefined;
  private acting: { name: string; route: string } | undefined;
  private planSaid = false;
  private directions: Direction[] = [];
  private readonly pages = new Map<
    string,
    { evidence: Omit<RouteEvidence, 'probes'>; stepIndex: number; atMs: number }
  >();

  constructor(
    from: RunState,
    private readonly deps: RunDeps,
  ) {
    this.coverage = new Coverage(deps.origin);
    this.probes = new ProbeRunner(deps.site, from.runId, (result) =>
      this.emit([{ type: 'probe.result', result }]),
    );
    this.state = {
      ...from,
      phase: 'audit',
      activity: 'acting',
      step: 0,
      stepEstimate: 40,
      elapsedMs: 0,
      nowText: 'Opening your site',
      routes: [],
      controlsTried: { done: 0, total: 0 },
      findings: [],
      changes: [],
      queued: [],
      overlays: { problems: [] },
      fixingCount: 0,
      fittsTyping: false,
      driverClicks: [],
      cost: {
        ...from.cost,
        spentUsd: 0,
        byPhase: { fixes: 0, reviewers: 0, crawling: 0, summing: 0, media: 0 },
      },
    };
    delete this.state.waitingFor;
    delete this.state.gate;
    delete this.state.rewindStep;
  }

  // ── Events ────────────────────────────────────────────────────────────────

  private emit(events: RunEvent[]): void {
    for (const e of events) this.state = reduce(this.state, e) ?? this.state;
    this.deps.emit(events);
  }

  private id(): string {
    this.items += 1;
    return `${this.state.runId}-r${this.items}`;
  }

  private say(text: string): void {
    this.emit([{ type: 'chat.item', item: { id: this.id(), type: 'fitts.message', text } }]);
  }

  private setActivity(activity: RunState['activity']): void {
    if (this.state.activity !== activity) this.emit([{ type: 'activity.changed', activity }]);
  }

  /** Posts an edge-state card and waits for its answer (§6.3). */
  private card(kind: EdgeStateKind, onAnswer: (answer: string) => void, block = true): string {
    const id = this.id();
    const item: ChatItem = { id, type: 'state', stateKind: kind };
    this.emit([{ type: 'chat.item', item }]);
    if (block) {
      this.emit([{ type: 'waiting.changed', waitingFor: `question:${id}` }]);
      this.setActivity('waiting-on-user');
    }
    this.handlers.set(id, onAnswer);
    return id;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    this.emit([{ type: 'run.started', state: this.state }]);
    this.say('Looking around your site now. I’ll try every control on every page I can reach.');
    this.clock = setInterval(() => {
      if (this.state.activity === 'acting' || this.state.activity === 'redesigning')
        this.emit([{ type: 'clock.tick', elapsedMs: this.state.elapsedMs + 1000 }]);
    }, 1000);
    // Ledger spend for this run becomes its cost; the guard posts the budget cards.
    this.deps.ledger.onEntry((entry) => {
      if (entry.runId !== this.state.runId || this.finished) return;
      const t = this.deps.ledger.totals(this.state.runId);
      this.emit([
        { type: 'cost', cost: { ...this.state.cost, ...t } },
        { type: 'ledger.entry', entry },
      ]);
      this.checkBudget();
    });
    void this.loop();
  }

  private checkBudget(): void {
    const { spentUsd, capUsd } = this.state.cost;
    const action = this.deps.budget.check(this.state.runId, spentUsd, capUsd);
    if (action === 'warn')
      this.card(
        'budget-warning',
        (a) => {
          if (a === 'economy') {
            this.deps.onEconomy?.();
            this.say('Switching to Economy for the rest of the run.');
          } else this.say(`Staying on Quality. I’ll pause and ask at $${capUsd}.`);
        },
        false,
      );
    if (action === 'stop')
      this.card('budget', (a) => {
        if (a === 'stop') return this.finish();
        this.emit([
          { type: 'cost', cost: { ...this.state.cost, capUsd: this.state.cost.capUsd + 10 } },
        ]);
        this.say(`Thanks. The cap is now $${this.state.cost.capUsd}. Carrying on.`);
        this.resumeFromCard();
      });
  }

  /** May the agent spend? (LlmCaller refuses calls while the run is at its cap.) */
  allowed(): boolean {
    return this.deps.budget.allowed(this.state.cost.spentUsd, this.state.cost.capUsd);
  }

  get signal(): AbortSignal {
    return this.abort.signal;
  }

  private blocked(): boolean {
    const a = this.state.activity;
    return a === 'paused' || a === 'user-driving' || a === 'waiting-on-user';
  }

  private kick(): void {
    const w = this.wake;
    this.wake = undefined;
    w?.();
  }

  private sleepUntilKicked(): Promise<void> {
    return new Promise((resolve) => {
      this.wake = resolve;
    });
  }

  private async loop(): Promise<void> {
    while (!this.finished) {
      if (this.blocked()) {
        await this.sleepUntilKicked();
        continue;
      }
      if (this.state.step >= MAX_STEPS) break;
      let snap: AxSnapshot;
      try {
        snap = await this.deps.site.snapshot();
      } catch {
        await this.siteTrouble();
        continue;
      }
      this.coverage.observe(snap);
      this.coverage.setStatus(snap.path, 'testing');
      this.syncCoverage();
      if (this.loginWall(snap)) continue;
      await this.probes.onPage(snap);
      await this.remember(snap);
      if (this.pages.size >= THEME_ROUTES && !this.themeAsked && this.deps.themeFit) {
        this.themeAsked = true;
        void this.checkTheme();
      }
      if (this.blocked() || this.finished) continue;

      const here = routeOf(snap.path);
      const empty = this.probes.emptySubmit(snap, this.coverage.untried(here));
      let action: Action;
      try {
        action = empty
          ? { kind: 'click', ...empty, why: `Trying ${empty.name} with the form empty` }
          : await this.deps.brain.next({
              snapshot: snap,
              coverage: this.coverage,
              brief: this.state.brief,
              history: this.history,
              signal: this.abort.signal,
            });
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') continue;
        throw e;
      }
      if (this.blocked()) continue;
      if (action.kind === 'done') break;
      await this.perform(action, snap.path);
      this.deliverQueued();
    }
    if (this.finished) return;
    this.emit([{ type: 'now.changed', nowText: 'Checking links and network' }]);
    await this.probes.finish();
    if (this.finished) return;
    await this.review();
    if (this.finished) return;
    if (!(await this.offerFixes())) this.crawlComplete();
  }

  // ── Fixes (§9) ────────────────────────────────────────────────────────────

  /**
   * After the review: fixable findings in a project that is its own git repo get fixed, per
   * mode. Plan only says what it would fix; Autonomous and Dangerous start right away; the Ask
   * modes post the approval card. Returns false when there's nothing to fix here.
   */
  private async offerFixes(): Promise<boolean> {
    const fixer = this.deps.fixer;
    if (!fixer) return false;
    const shown = this.state.findings
      .filter((f) => f.lane !== 'suggestion' && f.status === 'open')
      .map((f) => f.id);
    let available = false;
    try {
      available = ((await this.deps.site.fix({ fn: 'available' })) as { ok: boolean }).ok;
    } catch {
      available = false;
    }
    if (!available || this.finished) return false;
    this.pipeline = new FixPipeline(
      {
        state: () => this.state,
        emit: (events) => this.emit(events),
        say: (text) => this.say(text),
        id: () => this.id(),
        ask: (text) => this.ask(text),
        baseline: (route) => this.probes.results.filter((r) => r.route === route),
        costOf: (id) => this.deps.ledger.findingCost(id),
        idle: () => this.fixesSettled(),
      },
      this.deps.site,
      fixer,
      this.checks,
    );
    const fixable = this.pipeline.fixable(shown);
    if (fixable.length === 0) return false;
    const mode = this.state.mode;
    if (mode === 'plan') {
      this.say(format(copy.fitts.planOnlyFixes, { n: fixable.length }));
      return false;
    }
    this.fixPhase = true;
    this.emit([{ type: 'now.changed' }]);
    if (mode === 'autonomous' || mode === 'dangerous') {
      this.say(
        `Fixing ${fixable.length} of these now. Each one is checked before its pull request opens.`,
      );
      this.pipeline.start(fixable);
      return true;
    }
    const serious = this.state.findings.filter(
      (f) => fixable.includes(f.id) && f.severity >= 3,
    ).length;
    const id = this.id();
    this.approvalId = id;
    this.emit([
      { type: 'chat.item', item: { id, type: 'approval.batch', findingIds: fixable, serious } },
      { type: 'waiting.changed', waitingFor: 'approval' },
    ]);
    this.setActivity('waiting-on-user');
    return true;
  }

  /** Approve the batch, or "Fix it" on one finding (§9.3: approving covers its PR). */
  approveFixes(findingIds: string[]): void {
    if (!this.pipeline) return;
    if (this.approvalId) {
      const item = this.state.chat.find((c) => c.id === this.approvalId);
      if (item?.type === 'approval.batch')
        this.emit([{ type: 'chat.item.updated', item: { ...item, answer: findingIds.join(',') } }]);
      this.approvalId = undefined;
      this.emit([{ type: 'waiting.changed' }]);
      if (!this.finished) this.setActivity('acting');
    }
    this.fixPhase = true;
    this.pipeline.start(findingIds);
    if (!this.pipeline.busy) this.fixesSettled();
  }

  dismissFinding(findingId: string): void {
    const f = this.state.findings.find((x) => x.id === findingId);
    if (!f) return;
    this.emit([
      { type: 'finding.updated', finding: { ...f, status: 'dismissed' } },
      {
        type: 'overlay.set',
        overlays: {
          ...this.state.overlays,
          problems: this.state.overlays.problems.filter((p) => p.ref !== f.elementRef),
        },
      },
    ]);
    this.say(copy.fitts.dismissFollowUp);
  }

  retryChange(changeId: string): void {
    this.pipeline?.retry(changeId);
  }

  undoChange(changeId: string): void {
    void this.pipeline
      ?.undo(changeId)
      .catch((e: unknown) => this.say(`I couldn’t undo that: ${(e as Error).message}`));
  }

  /** Every fix has settled: FINALIZE (preview branch, then Done), once. */
  private fixesSettled(): void {
    if (this.approvalId || this.pipeline?.busy || this.finalized || !this.fixPhase) return;
    this.finalized = true;
    void (async () => {
      try {
        const branch = await this.pipeline?.preview();
        if (branch)
          this.say(`Every verified fix is merged into ${branch} so you can try them together.`);
      } catch {
        // The preview branch is a convenience; Done doesn't wait on it.
      }
      this.finish();
    })();
  }

  /** A route's first visit: its screenshot and controls, for the reviewer panel. */
  private async remember(snap: AxSnapshot): Promise<void> {
    const route = routeOf(snap.path);
    if (this.pages.has(route)) return;
    let shot: RouteEvidence['shot'];
    if (this.deps.panel || this.deps.themeFit) {
      try {
        shot = { jpegBase64: (await this.deps.site.screenshot()).jpegBase64 };
      } catch {
        // Reviewed without a screenshot.
      }
    }
    this.pages.set(route, {
      evidence: { route, snapshot: snap, trace: [], ...(shot ? { shot } : {}) },
      stepIndex: this.state.step,
      atMs: this.state.elapsedMs,
    });
  }

  /** Plan only and Ask every action, for a click or typing (§13). False skips the control. */
  private async mayAct(
    action: Extract<Action, { kind: 'click' | 'type' }>,
    from: string,
  ): Promise<boolean> {
    const mode = this.state.mode;
    if (mode === 'plan') {
      if (!this.planSaid) {
        this.planSaid = true;
        this.say('You picked Plan only, so I’ll look at each control without touching it.');
      }
      this.emit([{ type: 'now.changed', nowText: `Looking at ${action.name || 'a control'}` }]);
      this.coverage.skip(from, action.ref, 'Plan only: looked, didn’t touch');
      return false;
    }
    if (mode !== 'ask-every') return true;
    const verb = action.kind === 'type' ? `type in ${action.name}` : `tap ${action.name}`;
    const ok = await this.ask(format(copy.fitts.askToAct, { action: verb }));
    if (!ok) {
      this.coverage.skip(from, action.ref, 'you skipped it');
      this.say(copy.fitts.skippedAction);
    }
    return ok && !this.finished;
  }

  /** A blocking "Can I …?" question with Go ahead / Skip it. */
  private ask(text: string): Promise<boolean> {
    return new Promise((resolve) => {
      const id = this.id();
      this.emit([
        {
          type: 'chat.item',
          item: {
            id,
            type: 'question',
            blocking: true,
            text,
            options: [copy.fitts.goAhead, copy.fitts.skipIt],
          },
        },
        { type: 'waiting.changed', waitingFor: `question:${id}` },
      ]);
      this.setActivity('waiting-on-user');
      const done = (ok: boolean) => {
        this.pendingAsk = undefined;
        this.handlers.delete(id);
        resolve(ok);
      };
      this.pendingAsk = done;
      this.handlers.set(id, (answer) => {
        if (!this.finished && this.state.activity === 'waiting-on-user') this.setActivity('acting');
        done(answer === copy.fitts.goAhead);
      });
    });
  }

  /**
   * A write from Fitts's own action was held at the network (§13). Dangerous mode on localhost
   * lets it through; every other mode opens the gate modal and waits.
   */
  held(held: HeldRequest): void {
    if (this.finished) {
      void this.deps.site.release(held.id, false);
      return;
    }
    const action = this.acting?.name ?? 'that';
    let path = held.url;
    try {
      path = new URL(held.url).pathname;
    } catch {
      // Keep the URL.
    }
    if (this.state.mode === 'dangerous' && isLocal(this.deps.origin)) {
      void this.deps.site.release(held.id, true);
      this.say(format(copy.fitts.gateSkippedDangerous, { action }));
      return;
    }
    const gateId = `gate-${held.id}`;
    this.heldReq = { held, gateId };
    this.emit([
      {
        type: 'gate.requested',
        gate: {
          id: gateId,
          action,
          route:
            this.acting?.route ??
            routeOf(this.state.routes.find((r) => r.status === 'testing')?.path ?? '/'),
          heldRequest: `${held.method} ${path}`,
          testing: 'H3 user control and H5 error prevention',
        },
      },
      { type: 'waiting.changed', waitingFor: 'gate' },
    ]);
    this.setActivity('waiting-on-user');
  }

  /** The gate modal's answer: send or fail the held request, then carry on (§13). */
  respondGate(gateId: string, decision: 'deny' | 'other' | 'allow'): void {
    const h = this.heldReq;
    if (!h || h.gateId !== gateId) return;
    this.heldReq = undefined;
    void this.deps.site.release(h.held.id, decision === 'allow');
    this.emit([{ type: 'gate.decided', gateId, decision }]);
    this.say(
      decision === 'allow'
        ? copy.fitts.gateAllowed
        : decision === 'other'
          ? copy.fitts.gateOther
          : copy.fitts.gateDenied,
    );
    this.resumeFromCard();
  }

  /**
   * Theme-fit, alongside the crawl: when the look doesn't suit who the site is for, post the
   * lookfeel card and 3 directions (§8.3). Autonomous picks the first (closest to the brief).
   */
  private async checkTheme(): Promise<void> {
    const ask = this.deps.themeFit;
    if (!ask) return;
    const pages = [...this.pages.values()].slice(0, THEME_ROUTES);
    const shots = pages.flatMap((p) => (p.evidence.shot ? [p.evidence.shot.jpegBase64] : []));
    const inventory = this.probes.results
      .filter((r) => r.probe === 'font-inventory' && r.summary)
      .slice(0, THEME_ROUTES)
      .map((r) => `${r.route}: ${r.summary ?? ''}`);
    let verdict: ThemeFit;
    try {
      verdict = await ask({ brief: this.state.brief, shots, inventory }, this.abort.signal);
    } catch {
      return; // No verdict (aborted, or an unusable answer): the audit goes on without one.
    }
    if (this.finished || verdict.fits) return;
    this.directions = verdict.directions;
    this.emit([
      { type: 'chat.item', item: { id: this.id(), type: 'lookfeel', text: verdict.why } },
      {
        type: 'chat.item',
        item: {
          id: this.id(),
          type: 'directions',
          options: verdict.directions.map(({ id, name, swatches }) => ({ id, name, swatches })),
        },
      },
    ]);
    const first = verdict.directions[0];
    if (this.state.mode === 'autonomous' && first) this.pickDirection(first.id);
  }

  pickDirection(directionId: string): void {
    const item = [...this.state.chat].reverse().find((c) => c.type === 'directions');
    const picked = this.directions.find((d) => d.id === directionId);
    if (item?.type !== 'directions' || !picked) return;
    this.emit([{ type: 'chat.item.updated', item: { ...item, selectedId: directionId } }]);
    this.say(`Going with ${picked.name}: ${picked.notes}`);
  }

  /** The panel reviews each page, then the aggregator turns everything into findings (§8). */
  private async review(): Promise<void> {
    const panel = this.deps.panel;
    const reviews = [];
    if (panel) {
      const pages = [...this.pages.values()];
      for (let i = 0; i < pages.length; i += ROUTES_IN_FLIGHT) {
        if (this.finished) return;
        const batch = pages.slice(i, i + ROUTES_IN_FLIGHT);
        this.emit([
          {
            type: 'now.changed',
            nowText: `Reviewing ${batch.map((p) => p.evidence.route).join(' and ')} with the panel`,
          },
        ]);
        try {
          const done = await Promise.all(
            batch.map((p) =>
              panel.review(
                {
                  ...p.evidence,
                  probes: this.probes.results.filter((r) => r.route === p.evidence.route),
                },
                this.state.brief,
                this.abort.signal,
              ),
            ),
          );
          reviews.push(...done.flat());
        } catch {
          // Aborted (⌘. or stop): carry on with what the panel has said so far.
        }
      }
    }
    const { findings, checks } = aggregateWithChecks({
      runId: this.state.runId,
      probes: this.probes.results,
      reviews,
      stepOf: (route) => {
        const p = this.pages.get(route);
        return { stepIndex: p?.stepIndex ?? 0, atMs: p?.atMs ?? 0 };
      },
    });
    this.checks = checks;
    this.post(findings);
  }

  /** Adds findings; shown ones get a chat card and a numbered pin (§8.2: suggestions don't). */
  private post(findings: Finding[]): void {
    const problems = [...this.state.overlays.problems];
    const events: RunEvent[] = [];
    for (const f of findings) {
      events.push({ type: 'finding.created', finding: f });
      if (f.lane === 'suggestion') continue;
      events.push({ type: 'chat.item', item: { id: this.id(), type: 'finding', findingId: f.id } });
      if (f.elementRef) problems.push({ ref: f.elementRef, pin: problems.length + 1 });
    }
    events.push({ type: 'overlay.set', overlays: { ...this.state.overlays, problems } });
    this.emit(events);
  }

  private syncCoverage(): void {
    const routes = this.coverage.stateRoutes();
    const key = JSON.stringify(routes);
    const events: RunEvent[] = [];
    if (key !== this.lastRoutes) {
      this.lastRoutes = key;
      events.push({ type: 'routes.set', routes });
    }
    const ct = this.coverage.controlsTried();
    if (ct.done !== this.state.controlsTried.done || ct.total !== this.state.controlsTried.total)
      events.push({ type: 'controls.updated', ...ct });
    if (events.length) this.emit(events);
  }

  private async perform(action: Exclude<Action, { kind: 'done' }>, from: string): Promise<void> {
    const step = this.state.step + 1;
    const stepEstimate = Math.max(this.coverage.stepEstimate(), step);
    const label =
      action.kind === 'navigate'
        ? `opening ${action.path}`
        : action.kind === 'type'
          ? `typing in ${action.name}`
          : `tapping ${action.name}`;
    this.emit([
      { type: 'step.started', step, stepEstimate },
      { type: 'now.changed', nowText: action.why },
      {
        type: 'overlay.set',
        overlays: {
          problems: this.state.overlays.problems,
          ...(action.kind !== 'navigate'
            ? { attention: { ref: action.ref, label: `Fitts · ${label}` } }
            : {}),
        },
      },
    ]);
    await new Promise((r) => setTimeout(r, this.deps.actionDelayMs ?? 350));
    // The user took the wheel (or paused) while the action was being shown: don't act.
    if (this.blocked() || this.finished) {
      this.emit([{ type: 'step.finished', step }]);
      return;
    }
    // The mode, read at each action (§13): Plan only looks; Ask every action asks first.
    if (action.kind !== 'navigate' && !(await this.mayAct(action, from))) {
      this.emit([{ type: 'step.finished', step }]);
      this.syncCoverage();
      return;
    }
    this.acting = action.kind === 'click' ? { name: action.name, route: routeOf(from) } : undefined;
    try {
      if (action.kind === 'navigate') {
        if (this.coverage.routeDone(from)) this.coverage.setStatus(from, 'done');
        await this.deps.site.navigate(action.path);
        this.history.push(`opened ${action.path}`);
        this.pages.get(routeOf(from))?.evidence.trace.push(`opened ${action.path}`);
      } else {
        const result =
          action.kind === 'click'
            ? await this.deps.site.click(action.ref, DESTRUCTIVE.test(action.name))
            : await this.deps.site.type(action.ref, action.text);
        this.coverage.markTried(from, action.ref);
        this.acting = undefined;
        const errored = await this.probes.afterAction(action, from, result);
        const key = `${routeOf(from)} ${action.ref}`;
        if (errored && !this.retried.has(key)) {
          // A form that failed may work once its earlier steps are filled in (a person would
          // go back, fill them, and try again).
          this.retried.add(key);
          const set = this.retryOn.get(routeOf(from)) ?? new Set<string>();
          this.retryOn.set(routeOf(from), set.add(action.ref));
        }
        const arrived = routeOf(result.path);
        if (result.navigated && arrived !== routeOf(from)) {
          for (const ref of this.retryOn.get(arrived) ?? []) this.coverage.retry(arrived, ref);
          this.retryOn.delete(arrived);
        }
        const line = `${label}${result.navigated ? ` → ${result.path}` : ''}`;
        this.history.push(line);
        this.pages.get(routeOf(from))?.evidence.trace.push(line);
        if (this.coverage.routeDone(from)) this.coverage.setStatus(from, 'done');
      }
      this.failures = 0;
    } catch {
      // A control that can't be used (gone, covered) is skipped, so the run can't loop on it.
      if (action.kind !== 'navigate') this.coverage.skip(from, action.ref, "couldn't be used");
      else this.coverage.setStatus(action.path, 'done', 'unreachable');
      this.failures += 1;
      if (this.failures >= 3) await this.siteTrouble();
    }
    this.emit([{ type: 'step.finished', step }]);
    this.syncCoverage();
  }

  /** A password field and a login-ish route (or title) is a login wall (§6.3). */
  private loginWall(snap: AxSnapshot): boolean {
    const route = routeOf(snap.path);
    if (!snap.hasPassword || !(LOGIN.test(route) || LOGIN.test(snap.title))) return false;
    if (this.coverage.routeDone(route)) return false;
    this.card('login-wall', (a) => {
      if (a === 'wheel') return this.takeWheel();
      if (a === 'add-login')
        this.say('Saved test logins come in a later version. I’ll skip this page for now.');
      for (const c of this.coverage.untried(route))
        this.coverage.skip(route, c.ref, 'behind a login');
      this.coverage.setStatus(route, 'done', 'login');
      this.resumeFromCard();
    });
    return true;
  }

  /** The site stopped answering: the site-down card (§6.3). */
  private async siteTrouble(): Promise<void> {
    const health = await this.deps.site.health().catch(() => ({ up: false, log: [] as string[] }));
    if (health.up) return;
    this.siteDown();
  }

  /** Main reported the dev server down (3 failed health checks), or an action found it down. */
  siteDown(): void {
    if (
      this.finished ||
      this.state.chat.some(
        (c) => c.type === 'state' && c.stateKind === 'site-down' && c.answer === undefined,
      )
    )
      return;
    this.card('site-down', (a) => {
      if (a === 'restart') {
        this.say('Restarting your dev server.');
        void this.deps.site.restart().then((up) => {
          this.say(
            up
              ? 'It’s back. Carrying on.'
              : 'It didn’t come back. I’ll wait while you take a look.',
          );
          if (up) this.resumeFromCard();
          else this.waitForSite();
        });
        return;
      }
      this.say('Okay, I’ll wait. I’ll pick up where I left off as soon as it answers.');
      this.waitForSite();
    });
  }

  private waitForSite(): void {
    const poll = setInterval(() => {
      void this.deps.site.health().then((h) => {
        if (!h.up || this.finished) return;
        clearInterval(poll);
        this.say('Your site is back. Carrying on.');
        this.resumeFromCard();
      });
    }, 3000);
  }

  /** Three failed model calls in a row (§6.3): the api-trouble card, retried after 12s. */
  apiTrouble(): void {
    if (this.finished) return;
    const id = this.card('api-trouble', (a) => {
      if (a === 'pause') return this.pause();
      this.say('Retrying now.');
      this.resumeFromCard();
    });
    setTimeout(() => {
      const item = this.state.chat.find((c) => c.id === id);
      if (item?.type === 'state' && item.answer === undefined) this.answer(id, 'retry-now');
    }, API_RETRY_MS);
  }

  private resumeFromCard(): void {
    this.emit([{ type: 'waiting.changed' }]);
    if (!this.finished) this.setActivity('acting');
    this.kick();
  }

  private crawlComplete(): void {
    this.emit([
      { type: 'now.changed' },
      { type: 'overlay.set', overlays: { problems: this.state.overlays.problems } },
    ]);
    for (const r of this.coverage.stateRoutes()) this.coverage.setStatus(r.path, 'done', r.label);
    this.syncCoverage();
    const { done } = this.coverage.controlsTried();
    const pages = this.coverage.stateRoutes().length;
    if (this.state.findings.filter((f) => f.lane !== 'suggestion').length === 0) {
      this.setActivity('idle');
      this.card(
        'nothing-found',
        (a) => {
          if (a === 'finish') return this.finish();
          this.emit([
            {
              type: 'chat.item',
              item: {
                id: this.id(),
                type: 'steps',
                steps: [
                  { label: `Opened ${pages} pages`, costUsd: 0 },
                  { label: `Tried ${done} controls`, costUsd: 0 },
                  ...this.history.slice(-12).map((h) => ({ label: h, costUsd: 0 })),
                ],
              },
            },
          ]);
          this.say('That’s everything I checked.');
        },
        false,
      );
      return;
    }
    this.finish();
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    if (this.clock) clearInterval(this.clock);
    this.abort.abort();
    const { done } = this.coverage.controlsTried();
    this.emit([
      { type: 'now.changed' },
      { type: 'waiting.changed' },
      { type: 'overlay.set', overlays: { problems: this.state.overlays.problems } },
      { type: 'phase.changed', phase: 'done' },
      { type: 'activity.changed', activity: 'idle' },
    ]);
    const changes = this.state.changes;
    const verified = changes.filter((c) => c.status === 'verified').length;
    const prs = changes.filter((c) => c.status === 'verified' && c.prNumber !== undefined).length;
    const rolled = changes.filter((c) => c.status === 'rolled-back').length;
    this.say(
      changes.length > 0
        ? `All done. I verified ${verified} ${verified === 1 ? 'fix' : 'fixes'} and opened ${prs} pull ${prs === 1 ? 'request' : 'requests'}.` +
            (rolled > 0
              ? ` ${rolled} ${rolled === 1 ? 'change' : 'changes'} didn’t pass my checks, so I rolled ${rolled === 1 ? 'it' : 'them'} back. Want me to try again with a different approach?`
              : '')
        : `All done. I opened ${this.coverage.stateRoutes().length} pages and tried ${done} controls.`,
    );
    this.kick();
  }

  dispose(): void {
    this.finished = true;
    this.pendingAsk?.(false);
    if (this.heldReq) void this.deps.site.release(this.heldReq.held.id, false);
    if (this.clock) clearInterval(this.clock);
    this.abort.abort();
    this.kick();
  }

  // ── RunEngine calls ───────────────────────────────────────────────────────

  pause(): void {
    if (this.state.activity === 'acting') this.setActivity('paused');
  }

  resume(): void {
    if (this.state.activity !== 'paused') return;
    this.setActivity(this.state.waitingFor ? 'waiting-on-user' : 'acting');
    this.kick();
  }

  /** ⌘.: abort the model call in flight, then ask what to do (§6.1). */
  stopAction(): void {
    if (this.finished) return;
    this.pendingAsk?.(false);
    this.abort.abort();
    this.abort = new AbortController();
    this.emit([{ type: 'now.changed' }]);
    this.card('stopped', (a) => {
      if (a === 'wheel') return this.takeWheel();
      if (a === 'skip') {
        const here = routeOf(this.state.routes.find((r) => r.status === 'testing')?.path ?? '/');
        const next = this.coverage.untried(here)[0];
        if (next) this.coverage.skip(here, next.ref, 'you skipped it');
        this.say('Skipped. Moving on.');
      } else this.say('Carrying on.');
      this.resumeFromCard();
    });
  }

  stopRun(): void {
    if (this.finished) return;
    this.pause();
    this.card('stop-run-confirm', (a) => {
      if (a === 'stop') return this.finish();
      this.say('Okay, carrying on.');
      this.resumeFromCard();
    });
  }

  takeWheel(): void {
    if (this.finished || this.state.activity === 'user-driving') return;
    this.pendingAsk?.(false);
    this.emit([
      { type: 'waiting.changed' },
      { type: 'activity.changed', activity: 'user-driving' },
      { type: 'now.changed' },
      { type: 'rewind.set' },
      { type: 'overlay.set', overlays: { problems: this.state.overlays.problems } },
      { type: 'user.actions.cleared' },
      { type: 'chat.item', item: { id: this.id(), type: 'driving' } },
    ]);
  }

  handBack(): void {
    if (this.state.activity !== 'user-driving') return;
    const clicks = this.state.driverClicks;
    if (clicks.length > 0)
      this.emit([
        {
          type: 'chat.item',
          item: {
            id: this.id(),
            type: 'steps',
            steps: clicks.map((label) => ({ label: `You clicked ${label}`, costUsd: 0 })),
          },
        },
      ]);
    this.say(
      clicks.length > 0
        ? `Thanks. You went through ${clicks.join(' → ')}. I’ll include that path.`
        : 'Thanks. Picking up where I left off.',
    );
    this.emit([{ type: 'user.actions.cleared' }]);
    this.setActivity('acting');
    this.kick();
  }

  recordUserClick(label: string): void {
    if (this.state.activity === 'user-driving') this.emit([{ type: 'user.action', label }]);
  }

  sendMessage(text: string, opts?: { pointingAt?: string; spoken?: boolean }): void {
    this.emit([
      {
        type: 'chat.item',
        item: {
          id: this.id(),
          type: 'user.message',
          text,
          ...(opts?.spoken ? { spoken: true } : {}),
          ...(opts?.pointingAt ? { pointingAt: opts.pointingAt } : {}),
        },
      },
    ]);
    if (this.state.activity === 'acting') this.emit([{ type: 'queued.added', text }]);
    else this.say('Got it. I’ll keep that in mind.');
  }

  /** Queued messages are delivered at the next step boundary (§6.1). */
  private deliverQueued(): void {
    const n = this.state.queued.length;
    if (n === 0) return;
    this.emit([{ type: 'queued.delivered', count: n }]);
    this.say(
      n === 1
        ? 'Got your note. I’ll keep that in mind.'
        : 'Got your notes. I’ll keep them in mind.',
    );
  }

  interruptNow(): void {
    this.abort.abort();
    this.abort = new AbortController();
    this.deliverQueued();
  }

  answer(itemId: string, answer: string): void {
    const item = this.state.chat.find((c) => c.id === itemId);
    if (!item || (item.type !== 'state' && item.type !== 'question') || item.answer !== undefined)
      return;
    this.emit([{ type: 'chat.item.updated', item: { ...item, answer } }]);
    if (this.state.waitingFor === `question:${itemId}`) this.emit([{ type: 'waiting.changed' }]);
    const handler = this.handlers.get(itemId);
    this.handlers.delete(itemId);
    handler?.(answer);
  }

  setMode(mode: Mode): void {
    this.emit([{ type: 'mode.changed', mode }]);
  }

  rewindTo(step: number | null): void {
    this.emit([step === null ? { type: 'rewind.set' } : { type: 'rewind.set', step }]);
  }

  updateBrief(brief: RunState['brief']): void {
    this.emit([{ type: 'brief.updated', brief }]);
    this.say('Got it, I’ll keep that in mind from here.');
  }
}

/** Dangerous mode works only on the user's own machine (§13). */
function isLocal(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}
