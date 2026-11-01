// The real audit (SPEC-phase2 §6): CRAWL as a step loop over the user's live site, with the
// coverage gate, stop/pause/queue, take the wheel, and edge states from real conditions.
// Probes (P5) run alongside it; reviewers (P6), the gate (P8) and fixes (P9) plug into this loop later.
import {
  DEVICES,
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
import type { SiteRect } from '@fitts/schema';
import type { Site } from '../site-client';
import type { Action, Brain } from '../crawler/brain';
import { Coverage, DESTRUCTIVE, routeOf } from '../crawler/coverage';
import { copy } from '../../renderer/copy';
import { format } from '../../renderer/lib/format';
import { ProbeRunner } from '../crawler/probes';
import { aggregateWithChecks, type Check } from '../review/aggregate';
import { FixPipeline, type Fixer, type Redesigner } from '../fix/pipeline';
import type { ReviewerPanel, RouteEvidence } from '../review/reviewers';
import { type Direction, type Inspiration, type ThemeFit } from '../review/themefit';
import { outlineSvg, type Media } from '../llm/media';
import { buildBoard, specFonts } from '@fitts/styles';
import { boardWords, solidPng } from './board-art';
import type { Converse } from './decider';
import {
  ScriptedDecider,
  type AbilityName,
  type Decider,
  type Decision,
  type Outcome,
  type Situation,
} from './abilities';

/** api-trouble retries on its own after this long (§6.3). */
export const API_RETRY_MS = 12_000;
/**
 * A safety ceiling, not a target (Allen's feedback, round 4): a run ends on coverage or on
 * going in circles (STALL_*), and the budget bounds it long before this. Big sites pass 200.
 */
export const MAX_STEPS = 1000;
/** Steps in a row on one page that move nothing: its untried controls are skipped. */
export const STALL_PAGE = 8;
/** Steps in a row anywhere that move nothing: the crawl ends. */
export const STALL_RUN = 24;
/** A finding's replay shows at most this many steps. */
const REPLAY_STEPS = 8;
/** Explore runs at most this many steps before the decider gets a say (§1.2). */
export const EXPLORE_STEPS = 12;
/** The decider sees this many recent outcomes. */
const RECENT = 8;

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
  /** Tests: a lower ceiling than MAX_STEPS. */
  maxSteps?: number;
  /** Picks the next ability (SPEC-phase3 §1.2). Without one, Phase 2's order. */
  decider?: Decider;
  /** Answers the owner while the work goes on (§1.3). Without one, a short acknowledgement. */
  converse?: Converse;
  /** What the owner wants to be called (Settings › General). */
  ownerName?: string;
  /** The reviewer panel (§8). Without one (no key, offline), probe findings stand alone. */
  panel?: ReviewerPanel;
  /** SAM outlines and Muse Image mockups (§10). Without it, the UI keeps DOM boxes. */
  media?: Media;
  /** The fixer (§9.2): without one (no key, offline), findings aren't fixed. */
  fixer?: Fixer;
  /** The redesigner (§8.3): applies a picked direction. Without one, directions are advice. */
  redesigner?: Redesigner;
  /** A new round of directions from the owner's feedback (SPEC-phase3 §2.3). */
  reviseLooks?: (
    input: {
      brief: RunState['brief'];
      why: string;
      shots: string[];
      inventory: string[];
      round: { n: number; previous: Direction[]; feedback: string };
    },
    signal?: AbortSignal,
  ) => Promise<Direction[]>;
  /** Theme-fit (§8.3), asked once after the first 3 routes. */
  themeFit?: (
    input: {
      brief: RunState['brief'];
      shots: string[];
      inventory: string[];
      inspiration?: Inspiration[];
    },
    signal?: AbortSignal,
  ) => Promise<ThemeFit>;
}

/** Media per run (§10): SAM outlines for the top shown findings, mockups for fewer. */
const MAX_OUTLINES = 12;

/** Theme-fit looks at this many routes' screenshots (§8.3). */
const THEME_ROUTES = 3;
/** A redesign is checked on at most this many pages (each loads on the worktree's server). */
const MAX_REDESIGN_PAGES = 10;
/** The phone pass looks at this many pages. */
const MAX_PHONE_PAGES = 8;
/** A route that's a file (a resume PDF, an image), not a page. */
const FILE_ROUTE = /\.(pdf|png|jpe?g|gif|svg|webp|zip|txt|json|xml)$/i;

/** Routes reviewed at once (§8.1: at most 2 in flight, 5 reviewers each). */
const ROUTES_IN_FLIGHT = 2;

const LOGIN = /\b(log ?in|sign ?in)\b|\/(login|signin|sign-in|auth)\b/i;
/** A site on this machine (a dev server); anything else is a live site with no server to restart. */
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;
/** A live site: Fitts has no code for it, so it audits and reports, and changes nothing. */
export const isLiveOrigin = (origin: string): boolean => !LOCAL_ORIGIN.test(origin);
/** A message about the redesign ("For the redesign, instead…", the Adjust it prefill). */
const ADJUST = /\b(redesign|the (new )?look)\b/i;

export class RealRun {
  state: RunState;
  readonly coverage: Coverage;
  readonly probes: ProbeRunner;
  private items = 0;
  private finished = false;
  private wake: (() => void) | undefined;
  private abort = new AbortController();
  private readonly history: string[] = [];
  /** Every step taken, for each finding's replay (Allen's feedback, round 4). */
  private readonly trail: { step: number; route: string; ref?: string; label: string }[] = [];
  private readonly handlers = new Map<string, (answer: string) => void>();
  private clock: ReturnType<typeof setInterval> | undefined;
  /** A failed action's control, so a stubborn element can't loop forever. */
  private failures = 0;
  /** Steps in a row that moved nothing (no new control tried, route seen, or route done). */
  private stalled = 0;
  private progressKey = '';
  /** The crawl can't usefully go on: covered, going in circles, or at the ceiling. */
  private crawlEnded = false;
  /** Abilities that have run to the end, and what the last few did (for the decider). */
  private readonly ran: Partial<Record<AbilityName, boolean>> = {};
  private readonly recent: Outcome[] = [];
  /** The owner's messages for the next decision, and the ones it already saw (§1.4). */
  private inbox: string[] = [];
  private readonly heard: string[] = [];
  /** Which round of directions is showing (§2.3). */
  private round = 1;
  /** The redesign's final review is open (§2.4): its item, its answer, its adjust. */
  private reviewing:
    | {
        id: string;
        resolve: (v: 'ok' | 'restart') => void;
        adjust: (text: string) => Promise<void>;
      }
    | undefined;
  /** "Send it back" was pressed: the owner's next message changes the redesign. */
  private sendingBack = false;
  /** The owner spoke while Fitts waited for a pick: that's for the decider, not a pick. */
  private pickInterrupted = false;
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
  /** Ask every action: "Allow everything this run", and the pages where you allowed it all. */
  private allowAll = false;
  private readonly allowedOn = new Set<string>();
  /** The chat's latest "steps" group, while Fitts's actions keep coming without a break. */
  private stepsItem: { id: string; steps: { label: string; costUsd: number }[] } | undefined;
  /** The request the gate modal is holding, and the action that sent it (§13). */
  private heldReq: { held: HeldRequest; gateId: string } | undefined;
  private acting: { name: string; route: string } | undefined;
  private planSaid = false;
  private directions: Direction[] = [];
  /** Theme-fit's reason, the direction picked (§8.3), and the mockups as PNG for the redesigner. */
  private lookWhy = '';
  private picked: Direction | undefined;
  private redesignStarted = false;
  /** Each direction's hero illustration as PNG (§2.2), for its board and the redesigner. */
  private readonly heroPngs = new Map<string, string>();
  /** The first screenshot of each site the owner admires, for the redesigner. */
  private inspirationShots: string[] = [];
  /** The review waits here for a pick in the Ask modes ("Keep my look" resolves it empty). */
  private pickWaiter: ((d: Direction | undefined) => void) | undefined;
  private pickQuestionId: string | undefined;
  private themeCheck: Promise<void> | undefined;
  private readonly pages = new Map<
    string,
    {
      evidence: Omit<RouteEvidence, 'probes'>;
      stepIndex: number;
      atMs: number;
      /** The shot's size and element boxes (SAM's box prompts, §10). */
      size?: { width: number; height: number };
      rects?: Record<string, SiteRect>;
    }
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
  private card(
    kind: EdgeStateKind,
    onAnswer: (answer: string) => void,
    block = true,
    detail?: Extract<ChatItem, { type: 'state' }>['detail'],
  ): string {
    const id = this.id();
    const item: ChatItem = { id, type: 'state', stateKind: kind, ...(detail ? { detail } : {}) };
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

  /**
   * The run (SPEC-phase3 §1): ask the decider what to do next, do it, and ask again, until an
   * ability ends the run (finish, or fixes that finish it when they settle). A decider that
   * fails falls back to Phase 2's order, so the run never stalls on it; so does the decision
   * after one a guarantee refused, so a decider can't spin on a refusal.
   */
  private async loop(): Promise<void> {
    const decider = this.deps.decider ?? new ScriptedDecider();
    const fallback = new ScriptedDecider();
    let refused = false;
    while (!this.finished) {
      // Once fixes are underway (or waiting on your answer), Fitts still listens: each message
      // gets a decision, so "another round of looks" happens instead of being noted
      // (Allen's feedback, round 6). Without a message there's nothing to decide.
      const listening = this.fixPhase && this.inbox.length > 0 && this.state.activity !== 'paused';
      if ((this.blocked() && !listening) || (this.fixPhase && this.inbox.length === 0)) {
        await this.sleepUntilKicked();
        continue;
      }
      this.deliverQueued();
      const situation = this.situation();
      this.heard.push(...this.inbox);
      this.inbox = [];
      // A real decision takes a moment: the Now line says what Fitts is doing meanwhile.
      if (this.deps.decider && !refused)
        this.emit([{ type: 'now.changed', nowText: 'Thinking about what’s next' }]);
      let decision: Decision;
      try {
        decision = await (refused ? fallback : decider).next(situation, this.abort.signal);
      } catch (e) {
        if (this.finished) return;
        if ((e as { name?: string }).name === 'AbortError') continue;
        decision = await fallback.next(situation);
      }
      if (this.finished) return;
      if (this.blocked() && !listening) continue;
      // The decider's line is what it's about to do: said only when the step will run, so a
      // refused step never announces itself (Allen's feedback, round 7).
      const refusal = this.refusal(decision);
      if (decision.say && !refusal) this.say(decision.say);
      this.emit([
        {
          type: 'ability.changed',
          ability: { name: decision.ability, since: this.state.elapsedMs },
        },
      ]);
      const outcome = refusal
        ? { ability: decision.ability, result: 'refused' as const, note: refusal }
        : await this.use(decision);
      if (!this.finished) this.emit([{ type: 'ability.changed' }]);
      refused = outcome.result === 'refused';
      this.recent.push(outcome);
      if (this.recent.length > RECENT) this.recent.shift();
      if (outcome.result === 'done' && outcome.ability === 'finish') return;
    }
  }

  /**
   * Why a step can't run yet, or undefined (§1.6). The audit's checks need the site explored
   * first: run before, they'd look at nothing, find nothing and count as done (Allen's
   * feedback, round 7: a redesign brief sent the decider straight to them).
   */
  private refusal(d: Decision): string | undefined {
    const needsPages: AbilityName[] = ['phone_pass', 'check_links', 'review', 'looks', 'fix'];
    if (needsPages.includes(d.ability) && !this.crawlEnded)
      return 'explore first: the crawl hasn’t finished';
    if (d.ability === 'check_theme' && this.pages.size === 0)
      return 'explore first: no page has been seen yet';
    return undefined;
  }

  /** Runs one ability. The guarantees (§1.6) are checked here, not by the decider. */
  private async use(d: Decision): Promise<Outcome> {
    const live = isLiveOrigin(this.deps.origin);
    const outcome = (result: Outcome['result'], note?: string): Outcome => ({
      ability: d.ability,
      result,
      ...(note ? { note } : {}),
    });
    switch (d.ability) {
      case 'explore':
        return this.explore(d.route);
      case 'phone_pass':
        await this.phonePass();
        this.ran.phone_pass = true;
        return outcome('done');
      case 'check_links':
        this.emit([{ type: 'now.changed', nowText: 'Checking links and network' }]);
        await this.probes.finish();
        this.ran.check_links = true;
        return outcome('done');
      case 'review':
        if (this.ran.review) return outcome('refused', 'already reviewed');
        await this.review();
        this.ran.review = true;
        return outcome('done');
      case 'check_theme':
        // A site with fewer than 3 pages still gets theme-fit, on what there is (§8.3).
        if (!this.themeAsked && this.deps.themeFit && this.pages.size > 0) {
          this.themeAsked = true;
          this.themeCheck = this.checkTheme();
        }
        await this.themeCheck;
        this.ran.check_theme = true;
        return outcome('done');
      case 'looks':
        if (live) return outcome('refused', 'a live site can’t be changed');
        this.pickInterrupted = false;
        await this.redesignStep();
        // The owner said something instead of picking: the decider hears it, then asks again.
        if (this.pickInterrupted) return outcome('progress', 'the owner spoke instead of picking');
        this.ran.looks = true;
        return outcome('done');
      case 'fix': {
        if (live) return outcome('refused', 'a live site can’t be changed');
        // Looks are showing and the owner hasn't chosen: that comes first (round 6).
        if (this.directions.length > 0 && !this.ran.looks && this.state.mode !== 'plan')
          return outcome('refused', 'the owner hasn’t picked a look yet; use looks first');
        if (this.fixPhase) return outcome('refused', 'fixes are already underway');
        this.ran.fix = true;
        return (await this.offerFixes()) ? outcome('done', 'fixing') : outcome('nothing');
      }
      case 'skip_pages': {
        const paths = (d.paths ?? []).map(routeOf);
        if (paths.length === 0) return outcome('nothing');
        for (const path of paths) this.coverage.skipRoute(path, 'you skipped it');
        this.syncCoverage();
        return outcome('done', paths.join(' '));
      }
      case 'stop_exploring':
        this.crawlEnded = true;
        return outcome('done');
      case 'new_look':
        if (live) return outcome('refused', 'a live site can’t be changed');
        if (this.redesignStarted) return outcome('refused', 'a look is already applied');
        // Looks are already showing: changing them is a new round, not starting over (round 6).
        if (this.directions.length > 0 && !this.picked)
          return outcome('refused', 'looks are already showing; use revise_looks');
        // The wish becomes the brief's look, and the theme is judged again with it (§1.4).
        this.emit([
          {
            type: 'brief.updated',
            brief: { ...this.state.brief, look: d.wish ?? this.state.brief.look ?? 'a new look' },
          },
        ]);
        this.themeAsked = false;
        this.themeCheck = undefined;
        this.directions = [];
        this.picked = undefined;
        delete this.ran.check_theme;
        delete this.ran.looks;
        return outcome('done');
      case 'revise_looks': {
        if (live) return outcome('refused', 'a live site can’t be changed');
        if (this.redesignStarted) return outcome('refused', 'a look is already applied');
        if (this.directions.length === 0 || !this.deps.reviseLooks)
          return outcome('refused', 'no directions to revise yet');
        return this.reviseLooks(d.wish ?? this.heard.slice(-3).join(' '));
      }
      case 'dismiss': {
        const f = this.state.findings.find(
          (x) => x.status === 'open' && d.ref !== undefined && x.elementRef === d.ref,
        );
        if (!f) return outcome('refused', 'no finding on that element');
        this.dismissFinding(f.id);
        return outcome('done', f.title);
      }
      case 'finish':
        // Fixes still running or waiting on the owner end the run themselves when they settle.
        if (this.fixPhase && (this.approvalId !== undefined || this.pipeline?.busy))
          return outcome('refused', 'fixes are still going; the run ends when they settle');
        // Every page and control is tried or skipped first, unless the crawl can't go on.
        if (!this.coverage.complete() && !this.crawlEnded)
          return outcome('refused', 'pages and controls are left to try');
        // And the audit's own checks have run: a run never ends unreviewed.
        for (const owed of ['phone_pass', 'check_links', 'review'] as const)
          if (!this.ran[owed]) return outcome('refused', `${owed} hasn’t run yet`);
        this.crawlComplete();
        return outcome('done');
    }
  }

  /** What the decider sees (§1.2). */
  private situation(): Situation {
    const routes = this.coverage.stateRoutes();
    const shown = this.state.findings.filter((f) => f.lane !== 'suggestion');
    const bySeverity: Record<number, number> = {};
    for (const f of shown) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    const next = this.coverage.nextRoute();
    return {
      brief: { ...this.state.brief },
      mode: this.state.mode,
      live: isLiveOrigin(this.deps.origin),
      coverage: {
        complete: this.coverage.complete(),
        ended: this.crawlEnded,
        controls: this.coverage.controlsTried(),
        routes: routes.map((r) => ({
          path: r.path,
          status: r.status,
          ...(r.label ? { label: r.label } : {}),
        })),
        ...(next ? { nextRoute: next } : {}),
      },
      stalled: this.stalled,
      findings: {
        total: shown.length,
        bySeverity,
        worst: [...shown]
          .sort((a, b) => b.severity - a.severity)
          .slice(0, 5)
          .map((f) => f.title),
      },
      ran: { ...this.ran },
      recent: [...this.recent],
      messages: [...this.inbox],
      earlier: this.heard.slice(-10),
      budget: { spentUsd: this.state.cost.spentUsd, capUsd: this.state.cost.capUsd },
    };
  }

  /**
   * Explore (§1.1): the crawl, a stretch at a time. It goes until the page it started on is
   * done or EXPLORE_STEPS pass, then the decider gets a say; the crawl ends (and says so) on
   * coverage, on going in circles, or at the ceiling. Re-entering it is seamless: each step
   * starts from a fresh snapshot.
   */
  private async explore(route?: string): Promise<Outcome> {
    const outcome = (result: Outcome['result'], note?: string): Outcome => ({
      ability: 'explore',
      result,
      ...(note ? { note } : {}),
    });
    if (route) {
      const snap = await this.deps.site.snapshot().catch(() => undefined);
      if (snap && routeOf(snap.path) !== routeOf(route))
        await this.perform({ kind: 'navigate', path: route, why: `Opening ${route}` }, snap.path);
    }
    let steps = 0;
    let startedOn: string | undefined;
    while (!this.finished) {
      if (this.blocked()) {
        await this.sleepUntilKicked();
        continue;
      }
      const max = this.deps.maxSteps ?? MAX_STEPS;
      if (this.state.step >= max) {
        // The ceiling, not the end of the site: say so, with what's left.
        this.say(format(copy.fitts.stepCap, { max, ...this.leftWords() }));
        this.crawlEnded = true;
        return outcome('done', 'ceiling');
      }
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
        this.themeCheck = this.checkTheme();
      }
      if (this.blocked() || this.finished) continue;

      const here = routeOf(snap.path);
      startedOn ??= here;
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
      if (action.kind === 'done') {
        this.crawlEnded = true;
        return outcome('done', 'covered');
      }
      await this.perform(action, snap.path);
      this.deliverQueued();
      if (this.circling(snap.path)) {
        this.crawlEnded = true;
        return outcome('done', 'going in circles');
      }
      steps += 1;
      // The owner said something: the next decision hears it now, not in 12 steps.
      if (this.inbox.length > 0) return outcome('progress', 'the owner spoke');
      if (steps >= EXPLORE_STEPS || this.coverage.routeDone(startedOn)) return outcome('progress');
    }
    return outcome('nothing');
  }

  // ── Fixes (§9) ────────────────────────────────────────────────────────────

  /**
   * After the review: fixable findings in a project that is its own git repo get fixed, per
   * mode. Plan only says what it would fix; Autonomous and Dangerous start right away; the Ask
   * modes post the approval card. Returns false when there's nothing to fix here.
   */
  private async offerFixes(): Promise<boolean> {
    const shown = this.state.findings
      .filter((f) => f.lane !== 'suggestion' && f.status === 'open')
      .map((f) => f.id);
    if (!(await this.ensurePipeline()) || !this.pipeline) return false;
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
    const item = this.state.chat.find((c) => c.id === this.approvalId);
    // Only the batch's own answer closes it. "Fix it" on another finding while the batch waits
    // is that one finding, not an answer for the rest (Allen's feedback, round 5).
    const answersBatch =
      item?.type === 'approval.batch' &&
      (findingIds.length === 0 || findingIds.every((id) => item.findingIds.includes(id)));
    if (answersBatch) {
      this.emit([{ type: 'chat.item.updated', item: { ...item, answer: findingIds.join(',') } }]);
      this.approvalId = undefined;
      this.emit([{ type: 'waiting.changed' }]);
      if (!this.finished) this.setActivity('acting');
    }
    // What Fitts can't check a fix for, it says so instead of quietly doing nothing.
    const fixable = this.pipeline.fixable(findingIds);
    const cant = this.state.findings.filter(
      (f) => findingIds.includes(f.id) && !fixable.includes(f.id),
    );
    for (const f of cant.slice(0, 3))
      this.say(format(copy.fitts.cantFix, { title: f.title, fix: f.fix }));
    if (fixable.length === 0) return;
    this.fixPhase = true;
    this.pipeline.start(fixable);
    if (!this.pipeline.busy) this.fixesSettled();
  }

  /** "It is a problem": a dismissed finding is open again, with its pin back on the page. */
  reopenFinding(findingId: string): void {
    const f = this.state.findings.find((x) => x.id === findingId);
    if (f?.status !== 'dismissed') return;
    const pin = this.state.overlays.problems.length + 1;
    this.emit([
      { type: 'finding.updated', finding: { ...f, status: 'open' } },
      ...(f.elementRef && !this.state.overlays.problems.some((p) => p.ref === f.elementRef)
        ? [
            {
              type: 'overlay.set' as const,
              overlays: {
                ...this.state.overlays,
                problems: [...this.state.overlays.problems, { ref: f.elementRef, pin }],
              },
            },
          ]
        : []),
    ]);
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

  retryChange(changeId: string, hint?: string): void {
    this.pipeline?.retry(changeId, hint);
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

  /**
   * Going in circles (Allen's feedback, round 4): a step that tries no new control, finds no
   * new page and finishes no page is no progress. STALL_PAGE of them in a row on one page
   * skips what's left there and moves on; STALL_RUN of them anywhere ends the crawl. Either
   * way Fitts says so. Returns true when the crawl should end.
   */
  private circling(path: string): boolean {
    const ct = this.coverage.controlsTried();
    const routes = this.coverage.stateRoutes();
    const done = routes.filter((r) => r.status === 'done').length;
    const key = `${ct.done}/${ct.total}/${routes.length}/${done}`;
    if (key !== this.progressKey) {
      this.progressKey = key;
      this.stalled = 0;
      return false;
    }
    this.stalled += 1;
    if (this.stalled >= STALL_RUN) {
      this.say(format(copy.fitts.circlingRun, this.leftWords()));
      return true;
    }
    const here = routeOf(path);
    const left = this.coverage.untried(here);
    if (this.stalled >= STALL_PAGE && left.length > 0) {
      for (const c of left) this.coverage.skip(here, c.ref, 'going in circles');
      this.coverage.setStatus(here, 'done', 'moved on');
      this.syncCoverage();
      this.say(format(copy.fitts.circlingPage, { route: here, n: left.length }));
      this.progressKey = '';
    }
    return false;
  }

  private leftWords(): { controls: number; pages: string } {
    const left = this.coverage.remaining();
    return {
      controls: left.controls,
      pages: left.routes === 1 ? '1 page' : `${left.routes} pages`,
    };
  }

  /** A route's first visit: its screenshot and controls, for the reviewer panel. */
  private async remember(snap: AxSnapshot): Promise<void> {
    const route = routeOf(snap.path);
    if (this.pages.has(route)) return;
    let shot: RouteEvidence['shot'];
    let size: { width: number; height: number } | undefined;
    let rects: Record<string, SiteRect> | undefined;
    if (this.deps.panel || this.deps.themeFit || this.deps.media) {
      try {
        const s = await this.deps.site.screenshot();
        shot = { jpegBase64: s.jpegBase64 };
        size = { width: s.width, height: s.height };
        // Element boxes on this shot: SAM's prompts, and where the Finding panel zooms to.
        {
          const refs = new Set([
            ...snap.nodes.map((n) => n.ref),
            ...this.probes.results
              .filter((r) => r.route === route)
              .flatMap((r) => r.items.map((i) => i.ref)),
          ]);
          rects = await this.deps.site.rects([...refs].filter(Boolean));
        }
      } catch {
        // Reviewed without a screenshot; SAM falls back to DOM boxes.
      }
    }
    this.pages.set(route, {
      evidence: { route, snapshot: snap, trace: [], ...(shot ? { shot } : {}) },
      stepIndex: this.state.step,
      atMs: this.state.elapsedMs,
      ...(size ? { size } : {}),
      ...(rects ? { rects } : {}),
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
    // What you've already allowed: everything this run, or everything on this page.
    if (this.allowAll || this.allowedOn.has(routeOf(from))) return true;
    // Show what Fitts wants to touch first: scrolled into view, outlined.
    await this.deps.site.reveal?.(action.ref).catch(() => undefined);
    const verb = action.kind === 'type' ? `type in ${action.name}` : `tap ${action.name}`;
    const p = copy.fitts.permission;
    const answer = await this.choose(format(copy.fitts.askToAct, { action: verb }), [
      p.once,
      p.page,
      p.run,
      copy.fitts.skipIt,
    ]);
    if (answer === p.page) this.allowedOn.add(routeOf(from));
    if (answer === p.run) this.allowAll = true;
    const ok = answer !== copy.fitts.skipIt;
    if (!ok) {
      this.coverage.skip(from, action.ref, 'you skipped it');
      this.say(copy.fitts.skippedAction);
    }
    return ok && !this.finished;
  }

  /**
   * Every action shows in the chat (Allen's feedback): actions in a row gather in one "steps"
   * group, which shows the latest and opens to show them all. Anything else in the chat starts
   * a new group.
   */
  private logAction(label: string): void {
    const last = this.state.chat.at(-1);
    const current = this.stepsItem && last?.id === this.stepsItem.id ? this.stepsItem : undefined;
    const steps = [...(current?.steps ?? []), { label, costUsd: 0 }].slice(-200);
    const item = { id: current?.id ?? this.id(), type: 'steps' as const, steps };
    this.stepsItem = { id: item.id, steps };
    this.emit([{ type: current ? 'chat.item.updated' : 'chat.item', item }]);
  }

  /** A blocking "Can I …?" question with Go ahead / Skip it. */
  private ask(text: string): Promise<boolean> {
    return this.choose(text, [copy.fitts.goAhead, copy.fitts.skipIt]).then(
      (answer) => answer === copy.fitts.goAhead,
    );
  }

  /**
   * A blocking question with its own buttons; resolves with the one pressed, or the last option
   * (the "no") when the run moves on without an answer.
   */
  private choose(text: string, options: string[]): Promise<string> {
    const no = options[options.length - 1] ?? '';
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
            options,
          },
        },
        { type: 'waiting.changed', waitingFor: `question:${id}` },
      ]);
      this.setActivity('waiting-on-user');
      const done = (answer: string) => {
        this.pendingAsk = undefined;
        this.handlers.delete(id);
        resolve(answer);
      };
      this.pendingAsk = (ok) => done(ok ? (options[0] ?? '') : no);
      this.handlers.set(id, (answer) => {
        if (!this.finished && this.state.activity === 'waiting-on-user') this.setActivity('acting');
        done(options.includes(answer) ? answer : no);
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
    const inspiration = await this.inspiration();
    this.inspirationShots = inspiration.flatMap((r) => r.shots.slice(0, 1));
    let verdict: ThemeFit;
    try {
      verdict = await ask(
        {
          brief: this.state.brief,
          shots,
          inventory,
          ...(inspiration.length ? { inspiration } : {}),
        },
        this.abort.signal,
      );
    } catch {
      return; // No verdict (aborted, or an unusable answer): the audit goes on without one.
    }
    if (this.finished || verdict.fits) return;
    // A live site has no code to restyle: the look is reported, with no directions to pick.
    if (isLiveOrigin(this.deps.origin)) {
      this.emit([
        { type: 'chat.item', item: { id: this.id(), type: 'lookfeel', text: verdict.why } },
      ]);
      this.say(
        'I can only look at a live site, not change it, so that’s a note for your report. Add the site’s code as a project and I can redesign it.',
      );
      return;
    }
    this.directions = verdict.directions;
    this.lookWhy = verdict.why;
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
    void this.directionBoards(verdict.directions);
  }

  /** The sites the owner admires (the brief's inspiration), screenshotted in main: at most 2. */
  private async inspiration(): Promise<Inspiration[]> {
    const urls = (this.state.brief.inspiration ?? '')
      .split(/[\s,]+/)
      .filter((u) => /\.[a-z]{2,}/i.test(u))
      .slice(0, 2);
    const reference = this.deps.site.reference?.bind(this.deps.site);
    if (!reference || urls.length === 0) return [];
    const got = await Promise.all(urls.map((u) => reference(u).catch(() => null)));
    return got.flatMap((r, i) =>
      r?.ok ? [{ url: urls[i] ?? '', shots: r.shots, style: r.style }] : [],
    );
  }

  /** A Muse Image mockup per direction, on the first route's shot (§10). */
  /**
   * A style board per direction (SPEC-phase3 §2): the parts as components in the site's own
   * words, built by code, with a hero illustration from the image model when it gives one. Each
   * board is posted on its direction as it's ready; one without a picture still posts.
   */
  private async directionBoards(directions: Direction[]): Promise<void> {
    const site = this.deps.site;
    if (!site.board) return;
    const snaps = [...this.pages.values()].map((p) => p.evidence.snapshot);
    const host = (() => {
      try {
        return new URL(this.deps.origin).hostname;
      } catch {
        return 'Your site';
      }
    })();
    const words = boardWords(snaps, host);
    await Promise.all(
      directions.map(async (d) => {
        const art = await this.heroArt(d, words.site);
        if (art) this.heroPngs.set(d.id, art);
        const html = buildBoard(
          d.spec,
          { ...words, line: d.notes },
          art ? { hero: `data:image/png;base64,${art}` } : {},
        );
        const url = await site
          .board?.(
            this.state.runId,
            `board-${d.id.replace(/[^\w-]+/g, '_')}.html`,
            html,
            specFonts(d.spec).map(({ family, id, weights }) => ({ family, id, weights })),
          )
          .catch(() => null);
        const item = [...this.state.chat].reverse().find((c) => c.type === 'directions');
        if (!url || item?.type !== 'directions') return;
        this.emit([
          {
            type: 'chat.item.updated',
            item: {
              ...item,
              options: item.options.map((o) => (o.id === d.id ? { ...o, board: url } : o)),
            },
          },
        ]);
      }),
    );
  }

  /** One hero illustration in the direction's colors (§2.2), painted on a blank canvas. */
  private async heroArt(d: Direction, siteName: string): Promise<string | null> {
    const media = this.deps.media;
    if (!media) return null;
    const p = d.spec.palette;
    const prompt =
      `Replace this blank canvas with one flat illustration for the hero of ${siteName}` +
      `${this.state.brief.for ? ` (${this.state.brief.for})` : ''}, in the style "${d.name}": ${d.notes} ` +
      `Use only these colors: ${[p.bg, p.surface, p.accent, p.accent2, p.text].join(', ')}. ` +
      'No text, letters, numbers, logos, UI or people’s faces. Simple shapes, generous empty space.';
    return media
      .edit(
        { runId: this.state.runId, projectId: this.state.projectId, allowed: () => this.allowed() },
        solidPng(1024, 768, p.bg),
        prompt,
        4 / 3,
      )
      .catch(() => null);
  }

  /**
   * A direction is picked (§8.3). It's applied once the review is done (the redesign runs
   * alone and first); picked later, during fixes, it's applied right away.
   */
  pickDirection(directionId: string): void {
    const item = [...this.state.chat].reverse().find((c) => c.type === 'directions');
    const picked = this.directions.find((d) => d.id === directionId);
    if (item?.type !== 'directions' || !picked) return;
    if (this.redesignStarted) {
      if (picked.id !== this.picked?.id)
        this.say(
          `I’ve already applied ${this.picked?.name ?? 'a look'}. Undo the redesign first, then start a new run to try ${picked.name}.`,
        );
      return;
    }
    this.picked = picked;
    this.emit([{ type: 'chat.item.updated', item: { ...item, selectedId: directionId } }]);
    // Without a redesigner (offline), or once the run is over, a pick is only acknowledged.
    if (!this.deps.redesigner || this.finished) {
      this.say(`Going with ${picked.name}: ${picked.notes}`);
      return;
    }
    if (this.state.mode === 'plan') {
      this.say(
        `Going with ${picked.name}: ${picked.notes} In Plan only I don’t change code, so that’s the look I’d apply.`,
      );
      return;
    }
    if (this.pickWaiter) {
      this.closePickQuestion(picked.name);
      return;
    }
    if (this.pipeline) {
      this.say(`Going with ${picked.name}. Applying it now.`);
      void this.applyRedesign();
    } else
      this.say(
        `Going with ${picked.name}: ${picked.notes} I’ll apply it to every page once I’ve finished looking around.`,
      );
  }

  /** Answers the "Which look?" question, whether by a pick or by "Keep my look". */
  private closePickQuestion(answer: string): void {
    const q = this.state.chat.find((c) => c.id === this.pickQuestionId);
    if (q?.type === 'question' && q.answer === undefined)
      this.emit([{ type: 'chat.item.updated', item: { ...q, answer } }]);
    if (this.state.waitingFor === `question:${this.pickQuestionId ?? ''}`)
      this.emit([{ type: 'waiting.changed' }]);
    if (this.pickQuestionId) this.handlers.delete(this.pickQuestionId);
    this.pickQuestionId = undefined;
    const waiter = this.pickWaiter;
    this.pickWaiter = undefined;
    if (!this.finished) this.setActivity('acting');
    waiter?.(answer === copy.fitts.keepLook ? undefined : this.picked);
  }

  /**
   * After the review: when theme-fit posted directions, apply the picked one. The Ask modes
   * wait for a pick ("Keep my look" skips it); Autonomous picked one already; Plan only never
   * changes code.
   */
  private async redesignStep(): Promise<void> {
    if (this.directions.length === 0 || !this.deps.redesigner || this.state.mode === 'plan') return;
    if (!this.picked) {
      const id = this.id();
      this.pickQuestionId = id;
      const pick = new Promise<Direction | undefined>((resolve) => (this.pickWaiter = resolve));
      // `answer` has recorded the button already; this closes the rest of the question.
      this.handlers.set(id, (answer) => this.closePickQuestion(answer));
      this.emit([
        {
          type: 'chat.item',
          item: {
            id,
            type: 'question',
            blocking: true,
            text: copy.fitts.whichLook,
            options: [copy.fitts.keepLook],
          },
        },
        { type: 'waiting.changed', waitingFor: `question:${id}` },
        { type: 'now.changed', nowText: 'Waiting for you to pick a look' },
      ]);
      this.setActivity('waiting-on-user');
      if (!(await pick) || this.finished) return;
    }
    await this.applyRedesign();
  }

  /** Runs the redesign job (§8.3) with the run's brief, pages, shots and the mockup. */
  private async applyRedesign(): Promise<void> {
    const direction = this.picked;
    if (!direction || this.redesignStarted || this.finished) return;
    if (!(await this.ensurePipeline())) {
      this.say(
        `I can’t change this project’s code (it needs to be its own git repo), so ${direction.name} stays a suggestion.`,
      );
      return;
    }
    const pipeline = this.pipeline;
    if (!pipeline) return;
    this.redesignStarted = true;
    // Pages, not files: a linked PDF or image isn't the site's look to restyle.
    const routes = [...this.pages.keys()]
      .filter((r) => !FILE_ROUTE.test(r))
      .slice(0, MAX_REDESIGN_PAGES);
    const before: Record<string, string> = {};
    for (const route of routes) {
      const shot = await this.routeShot(route);
      if (shot) before[route] = shot.url;
    }
    const mockup = this.heroPngs.get(direction.id);
    const shots = routes.slice(0, 2).flatMap((r) => {
      const s = this.pages.get(r)?.evidence.shot;
      return s ? [`data:image/jpeg;base64,${s.jpegBase64}`] : [];
    });
    const size = routes.map((r) => this.pages.get(r)?.size).find(Boolean);
    await pipeline.redesign({
      brief: this.state.brief,
      why: this.lookWhy,
      direction,
      routes,
      ...(size ? { size } : {}),
      images: [
        ...(mockup ? [`data:image/png;base64,${mockup}`] : []),
        ...shots,
        ...this.inspirationShots.map((b64) => `data:image/jpeg;base64,${b64}`),
      ],
      before,
      saveShot: (route, jpeg) =>
        this.deps.site.saveAsset(
          this.state.runId,
          `redesign-after-${route.replace(/[^\w]+/g, '_') || 'root'}.jpg`,
          jpeg,
        ),
    });
    if (!this.finished && this.state.activity === 'redesigning') this.setActivity('acting');
    // "Start over" (§2.4): the redesign was rolled back; the boards are open again.
    if (this.inbox.some((m) => m.startsWith('Start over on the look'))) {
      this.redesignStarted = false;
      this.picked = undefined;
      delete this.ran.looks;
      this.pickInterrupted = true;
    }
  }

  /**
   * A new round of directions from the owner's feedback (SPEC-phase3 §2.3): the three they saw
   * and what they said go to the compose call; the new ones get their own boards and replace
   * the old ones for picking.
   */
  private async reviseLooks(feedback: string): Promise<Outcome> {
    const revise = this.deps.reviseLooks;
    const outcome = (result: Outcome['result'], note?: string): Outcome => ({
      ability: 'revise_looks',
      result,
      ...(note ? { note } : {}),
    });
    if (!revise) return outcome('refused', 'no directions to revise yet');
    const n = this.round + 1;
    this.emit([{ type: 'now.changed', nowText: `Making round ${n} of the looks` }]);
    const pages = [...this.pages.values()].slice(0, THEME_ROUTES);
    let next: Direction[];
    try {
      next = await revise(
        {
          brief: this.state.brief,
          why: this.lookWhy,
          shots: pages.flatMap((p) => (p.evidence.shot ? [p.evidence.shot.jpegBase64] : [])),
          inventory: this.probes.results
            .filter((r) => r.probe === 'font-inventory' && r.summary)
            .slice(0, THEME_ROUTES)
            .map((r) => `${r.route}: ${r.summary ?? ''}`),
          round: { n, previous: this.directions, feedback },
        },
        this.abort.signal,
      );
    } catch {
      this.say('I couldn’t make a new round of looks just now. You can still pick one of these.');
      return outcome('nothing');
    }
    if (this.finished || next.length === 0) return outcome('nothing');
    this.round = n;
    // Ids carry the round, so a pick on an older board can't land on a newer one.
    this.directions = next.map((d) => ({ ...d, id: `r${n}-${d.id}` }));
    this.picked = undefined;
    delete this.ran.looks;
    const changed = next[0]?.spec.changes?.[0];
    this.emit([
      {
        type: 'chat.item',
        item: {
          id: this.id(),
          type: 'directions',
          round: n,
          ...(changed ? { changed } : {}),
          options: this.directions.map(({ id, name, swatches }) => ({ id, name, swatches })),
        },
      },
    ]);
    void this.directionBoards(this.directions);
    return outcome('done', `round ${n}`);
  }

  /**
   * The redesign's final review (SPEC-phase3 §2.4). In the Ask modes the PR waits for "It's
   * good"; anything the owner says meanwhile changes the branch first. In Autonomous the PR
   * opens and the review stays, with "Send it back".
   */
  private reviewRedesign(
    changeId: string,
    adjust: (text: string) => Promise<void>,
  ): Promise<'ok' | 'restart'> {
    const id = this.id();
    const autonomous = this.state.mode === 'autonomous' || this.state.mode === 'dangerous';
    this.emit([
      {
        type: 'chat.item',
        item: { id, type: 'review', changeId, ...(autonomous ? { autonomous: true } : {}) },
      },
    ]);
    if (autonomous || this.finished) return Promise.resolve('ok');
    this.say(copy.fitts.reviewAsk);
    this.emit([
      { type: 'waiting.changed', waitingFor: `question:${id}` },
      { type: 'now.changed', nowText: 'Waiting for your review of the new look' },
    ]);
    this.setActivity('waiting-on-user');
    return new Promise((resolve) => {
      this.reviewing = { id, resolve, adjust };
    });
  }

  private answerReview(item: Extract<ChatItem, { type: 'review' }>, answer: string): void {
    // Autonomous: the PR is open; "Send it back" asks what to change.
    if (item.autonomous) {
      if (answer !== 'back') return;
      this.emit([{ type: 'chat.item.updated', item: { ...item, answer } }]);
      this.sendingBack = true;
      this.say('What should I change? Tell me and I’ll update the pull request.');
      return;
    }
    const review = this.reviewing;
    if (!review || review.id !== item.id || (answer !== 'ok' && answer !== 'restart')) return;
    this.reviewing = undefined;
    this.emit([{ type: 'chat.item.updated', item: { ...item, answer } }]);
    if (this.state.waitingFor === `question:${item.id}`) this.emit([{ type: 'waiting.changed' }]);
    if (!this.finished) this.setActivity('redesigning');
    if (answer === 'restart') this.inbox.push('Start over on the look: none of it works.');
    review.resolve(answer);
  }

  /** "Keep" or "Undo this" on a wording card: undo reverts only that line (§8.3). */
  decideWording(itemId: string, decision: 'keep' | 'undo'): void {
    const item = this.state.chat.find((c) => c.id === itemId);
    if (item?.type !== 'wording' || item.decision) return;
    void (async () => {
      try {
        if (!(await this.pipeline?.decideWording(itemId, decision))) return;
        this.emit([{ type: 'chat.item.updated', item: { ...item, decision } }]);
      } catch (e) {
        this.say(`I couldn’t put that wording back: ${(e as Error).message}`);
      }
    })();
  }

  /**
   * The phone pass: every page again as a phone, with real mobile emulation (its viewport meta,
   * touch, a mobile user agent), the page probes, and a phone screenshot for the reviewers. The
   * device the user was looking at comes back afterwards.
   */
  private async phonePass(): Promise<void> {
    const site = this.deps.site;
    const phone = DEVICES.find((d) => d.id === 'phone');
    const routes = [...this.pages.keys()]
      .filter((r) => !FILE_ROUTE.test(r))
      .slice(0, MAX_PHONE_PAGES);
    if (!site.device || !phone || routes.length === 0) return;
    let previous: string | null;
    try {
      previous = await site.device(phone.id);
    } catch {
      return;
    }
    try {
      for (const route of routes) {
        if (this.finished) break;
        this.emit([{ type: 'now.changed', nowText: `Checking ${route} on a phone` }]);
        await site.navigate(route).catch(() => undefined);
        await new Promise((r) => setTimeout(r, 600));
        await this.probes.onDevice(route, phone);
        const shot = await site.screenshot().catch(() => null);
        const page = this.pages.get(route);
        if (shot && page)
          page.evidence.phoneShot = { jpegBase64: shot.jpegBase64, label: phone.label };
      }
    } finally {
      await site.device(previous).catch(() => undefined);
    }
  }

  /** The fix pipeline, once: only when the project is its own git repo (§9). */
  private async ensurePipeline(): Promise<boolean> {
    if (this.pipeline) return true;
    if (!this.deps.fixer) return false;
    let available = false;
    try {
      available = ((await this.deps.site.fix({ fn: 'available' })) as { ok: boolean }).ok;
    } catch {
      available = false;
    }
    if (!available || this.finished) return false;
    this.pipeline ??= new FixPipeline(
      {
        state: () => this.state,
        emit: (events) => this.emit(events),
        say: (text) => this.say(text),
        id: () => this.id(),
        ask: (text) => this.ask(text),
        baseline: (route) => this.probes.results.filter((r) => r.route === route),
        costOf: (id) => this.deps.ledger.findingCost(id),
        idle: () => this.fixesSettled(),
        restingActivity: () => (this.finished ? 'idle' : 'acting'),
        review: (changeId, adjust) => this.reviewRedesign(changeId, adjust),
      },
      this.deps.site,
      this.deps.fixer,
      this.checks,
      this.deps.redesigner,
    );
    return true;
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
    const withReplay = findings.map((f) => this.withReplay(f));
    this.post(withReplay);
    const shown = withReplay.filter((f) => f.lane !== 'suggestion');
    void this.evidence(shown).then(() => this.media(shown));
  }

  /**
   * The steps that led to a finding: from the step that opened its page to the step that used
   * its element (or a few steps in, when it isn't tied to one), at most REPLAY_STEPS of them.
   */
  private withReplay(f: Finding): Finding {
    const arrived = this.pages.get(f.route)?.stepIndex ?? f.stepIndex;
    const used = f.elementRef
      ? this.trail.find((t) => t.route === f.route && t.ref === f.elementRef && t.step >= arrived)
      : undefined;
    // Measured on the page as a whole (a probe, the phone pass): the steps after arriving have
    // nothing to do with it, so the replay is only the arrival (Allen's feedback, round 5).
    const last = used?.step ?? arrived;
    const steps = this.trail
      .filter((t) => t.step >= arrived && t.step <= last)
      .slice(-REPLAY_STEPS)
      .map((t) => ({ step: t.step, label: t.label }));
    if (steps.length === 0) return f;
    return { ...f, replay: steps, ...(used ? { stepIndex: used.step } : {}) };
  }

  /** A route's shot as an asset (saved once) and as PNG for Muse Image (converted once). */
  private readonly routeShots = new Map<
    string,
    Promise<{ url: string; png: () => Promise<string> } | null>
  >();

  private routeShot(route: string) {
    let cached = this.routeShots.get(route);
    if (!cached) {
      const page = this.pages.get(route);
      const shot = page?.evidence.shot;
      cached = shot
        ? (async () => {
            const name = `shot-${route.replace(/[^\w]+/g, '_') || 'root'}.jpg`;
            const url = await this.deps.site.saveAsset(this.state.runId, name, shot.jpegBase64);
            let png: Promise<string> | undefined;
            return { url, png: () => (png ??= this.deps.site.png(shot.jpegBase64)) };
          })().catch(() => null)
        : Promise.resolve(null);
      this.routeShots.set(route, cached);
    }
    return cached;
  }

  /**
   * §10, in the background: SAM outlines the element in each shown finding's shot. A failure
   * leaves the DOM box. Results are cached on the finding (`assets`). Findings no longer get a
   * Muse Image mockup: the fix panel shows the real fixed site instead (Allen's feedback).
   */
  private async media(shown: Finding[]): Promise<void> {
    const media = this.deps.media;
    if (!media || shown.length === 0) return;
    const ranked = [...shown].sort((a, b) => b.severity - a.severity);
    const ctx = (findingId: string) => ({
      runId: this.state.runId,
      projectId: this.state.projectId,
      findingId,
      allowed: () => this.allowed(),
    });
    const setAssets = (id: string, assets: NonNullable<Finding['assets']>) => {
      const f = this.state.findings.find((x) => x.id === id);
      if (f)
        this.emit([
          { type: 'finding.updated', finding: { ...f, assets: { ...f.assets, ...assets } } },
        ]);
    };
    for (const f of ranked.slice(0, MAX_OUTLINES)) {
      const page = this.pages.get(f.route);
      const shot = await this.routeShot(f.route);
      if (!page?.evidence.shot || !page.size || !shot) continue;
      setAssets(f.id, { shot: shot.url });
      const box = f.elementRef ? page.rects?.[f.elementRef] : undefined;
      if (!box) continue;
      const path = await media.outline(
        ctx(f.id),
        { jpegBase64: page.evidence.shot.jpegBase64, ...page.size },
        box,
      );
      if (!path) continue;
      const svg = outlineSvg(path, page.size.width, page.size.height);
      try {
        const url = await this.deps.site.saveAsset(
          this.state.runId,
          `mask-${f.id}.svg`,
          Buffer.from(svg).toString('base64'),
        );
        setAssets(f.id, { mask: url });
      } catch {
        // Keep the DOM box.
      }
    }
  }

  /**
   * What the Finding panel shows for each shown finding (Allen's feedback, round 5): the page's
   * shot with the element's box on it, so it can zoom in and outline it; for a problem that only
   * happens on a phone, the phone pass's shot of that page instead.
   */
  private async evidence(shown: Finding[]): Promise<void> {
    for (const f of shown) {
      if (this.finished) return;
      const page = this.pages.get(f.route);
      if (!page) continue;
      let next: Finding | undefined;
      const phone = f.seenOn ? page.evidence.phoneShot : undefined;
      if (phone) {
        const url = await this.deps.site
          .saveAsset(
            this.state.runId,
            `phone-${f.route.replace(/[^\w]+/g, '_') || 'root'}.jpg`,
            phone.jpegBase64,
          )
          .catch(() => null);
        if (url) next = { ...f, assets: { ...f.assets, shot: url } };
      } else {
        const shot = await this.routeShot(f.route);
        if (!shot) continue;
        const box = f.elementRef ? page.rects?.[f.elementRef] : undefined;
        next = {
          ...f,
          assets: { ...f.assets, shot: shot.url },
          ...(box && box.width > 0 && box.height > 0 ? { box } : {}),
          ...(page.size ? { shotSize: page.size } : {}),
        };
      }
      const now = this.state.findings.find((x) => x.id === f.id);
      if (next && now)
        this.emit([
          {
            type: 'finding.updated',
            finding: {
              ...now,
              assets: { ...now.assets, ...next.assets },
              ...(next.box ? { box: next.box } : {}),
              ...(next.shotSize ? { shotSize: next.shotSize } : {}),
            },
          },
        ]);
    }
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
        this.logAction(format(copy.fitts.did.opened, { path: action.path }));
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
        this.logAction(
          format(action.kind === 'click' ? copy.fitts.did.tapped : copy.fitts.did.typed, {
            name: action.name || action.ref,
          }) + (result.navigated && arrived !== routeOf(from) ? ` → ${result.path}` : ''),
        );
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
    const logged = this.stepsItem?.steps.at(-1)?.label;
    this.trail.push({
      step,
      route: routeOf(from),
      ...(action.kind !== 'navigate' ? { ref: action.ref } : {}),
      label: logged ?? label,
    });
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
    this.siteDown(health.log);
  }

  /**
   * Main reported the site down (3 failed health checks), or an action found it down. A live
   * site has no dev server: the card says the site isn't answering and offers a reload.
   */
  siteDown(log: string[] = []): void {
    if (
      this.finished ||
      this.state.chat.some(
        (c) => c.type === 'state' && c.stateKind === 'site-down' && c.answer === undefined,
      )
    )
      return;
    const live = isLiveOrigin(this.deps.origin);
    const url = this.deps.origin.replace(/^https?:\/\//, '');
    this.card(
      'site-down',
      (a) => {
        if (a === 'restart') {
          this.say(live ? 'Loading your site again.' : 'Restarting your dev server.');
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
      },
      true,
      { url, live, ...(live ? {} : { log: log.slice(-8) }) },
    );
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
    const redesigned = this.state.changes.some(
      (c) => c.kind === 'redesign' && c.status === 'verified',
    );
    if (!redesigned && this.state.findings.filter((f) => f.lane !== 'suggestion').length === 0) {
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
    this.pickWaiter?.(undefined);
    const { done } = this.coverage.controlsTried();
    this.emit([
      { type: 'now.changed' },
      { type: 'waiting.changed' },
      { type: 'overlay.set', overlays: { problems: this.state.overlays.problems } },
      { type: 'phase.changed', phase: 'done' },
      { type: 'activity.changed', activity: 'idle' },
    ]);
    // Wording cards are parts of the redesign, not changes of their own.
    const changes = this.state.changes.filter((c) => c.kind !== 'wording');
    const verified = changes.filter((c) => c.status === 'verified' && c.kind !== 'redesign').length;
    const redesigned = changes.some((c) => c.kind === 'redesign' && c.status === 'verified');
    const prs = changes.filter((c) => c.status === 'verified' && c.prNumber !== undefined).length;
    const rolled = changes.filter((c) => c.status === 'rolled-back').length;
    this.say(
      changes.length > 0
        ? `All done. I verified ${verified} ${verified === 1 ? 'fix' : 'fixes'}${redesigned ? ' and the redesign' : ''} and opened ${prs} pull ${prs === 1 ? 'request' : 'requests'}.` +
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
    this.pickWaiter?.(undefined);
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

  sendMessage(
    text: string,
    opts?: { pointingAt?: string; pointingLabel?: string; spoken?: boolean },
  ): void {
    this.emit([
      {
        type: 'chat.item',
        item: {
          id: this.id(),
          type: 'user.message',
          text,
          ...(opts?.spoken ? { spoken: true } : {}),
          ...(opts?.pointingAt ? { pointingAt: opts.pointingAt } : {}),
          ...(opts?.pointingLabel ? { pointingLabel: opts.pointingLabel.slice(0, 80) } : {}),
        },
      },
    ]);
    // In the final review (§2.4), or after "Send it back", what they say changes the redesign.
    const review = this.reviewing;
    if (review) {
      this.say('On it. I’ll change that and check every page again, then ask you again.');
      void review.adjust(text).then(() => {
        if (this.reviewing === review) this.say(copy.fitts.reviewAgain);
      });
      return;
    }
    if (this.sendingBack && this.pipeline?.canAdjust) {
      this.sendingBack = false;
      this.say('On it. I’ll change that, check every page again and update the pull request.');
      void this.pipeline.adjust(text);
      return;
    }
    // "Adjust it" (§8.3): a note about the redesign changes it, verified like the first pass.
    if (this.pipeline?.canAdjust && ADJUST.test(text)) {
      this.say('On it. I’ll adjust the redesign and check every page again.');
      void this.pipeline.adjust(text);
      return;
    }
    // The next decision hears it (§1.4); while Fitts acts, it shows as queued until then.
    const pointing = opts?.pointingAt
      ? ` [pointing at ref ${opts.pointingAt}${opts.pointingLabel ? `: ${opts.pointingLabel}` : ''}]`
      : '';
    // Without a conversation, a message waits for the next step, shown as queued. With one,
    // it's answered right away and heard by the next decision: no queued row that lingers.
    if (this.state.activity === 'acting' && !this.deps.converse)
      this.emit([{ type: 'queued.added', text }]);
    this.inbox.push(`${text}${pointing}`);
    // Waiting for a pick, they said something instead: feedback for a new round, maybe.
    if (this.pickWaiter) {
      this.pickInterrupted = true;
      this.closePickQuestion(text.slice(0, 80));
    }
    this.kick();
    // And a reply right away, while the work goes on (§1.3).
    if (this.deps.converse) void this.reply(text, opts?.pointingLabel ?? opts?.pointingAt);
    else if (this.state.activity !== 'acting') this.say('Got it. I’ll keep that in mind.');
  }

  /** Where the new look stands, in words, so a reply never claims more than happened. */
  private lookFacts(): string {
    const redesign = this.state.changes.find((c) => c.kind === 'redesign');
    if (redesign?.status === 'verified') return `applied: ${redesign.title}`;
    if (redesign) return `tried and ${redesign.status}: ${redesign.title}`;
    if (this.redesignStarted) return 'being applied now';
    if (this.picked) return `picked ${this.picked.name}, not applied yet`;
    if (this.directions.length > 0)
      return `showing looks to pick from: ${this.directions.map((d) => d.name).join(', ')}`;
    if (this.themeAsked) return 'the look was checked; no looks made';
    return 'nothing yet: the site hasn’t been explored enough to judge the look';
  }

  /** Fitts answers the owner (§1.3), from what it's doing and has seen. */
  private async reply(message: string, pointingAt?: string): Promise<void> {
    const converse = this.deps.converse;
    if (!converse) return;
    const recent = this.state.chat
      .flatMap((c) =>
        c.type === 'fitts.message'
          ? [`Fitts: ${c.text}`]
          : c.type === 'user.message'
            ? [`Owner: ${c.text}`]
            : [],
      )
      .slice(-9, -1);
    const shown = this.state.findings.filter((f) => f.lane !== 'suggestion');
    this.emit([{ type: 'typing.changed', typing: true }]);
    try {
      const text = await converse(
        {
          brief: { ...this.state.brief },
          live: isLiveOrigin(this.deps.origin),
          now: this.state.nowText ?? 'between steps',
          covered: {
            pages: this.coverage.stateRoutes().length,
            controls: this.coverage.controlsTried(),
          },
          findings: [...shown]
            .sort((a, b) => b.severity - a.severity)
            .slice(0, 8)
            .map((f) => `${f.title} (${f.route})`),
          recent,
          message,
          look: this.lookFacts(),
          ...(pointingAt ? { pointingAt } : {}),
          ...(this.deps.ownerName ? { name: this.deps.ownerName } : {}),
        },
        this.finished ? undefined : this.abort.signal,
      );
      this.say(text);
    } catch {
      // No reply (offline, aborted): the decision still hears it.
      if (!this.finished) this.say('Got it. I’ll keep that in mind.');
    } finally {
      this.emit([{ type: 'typing.changed', typing: false }]);
    }
  }

  /** Queued messages are delivered at the next step boundary (§6.1). */
  private deliverQueued(): void {
    const n = this.state.queued.length;
    if (n === 0) return;
    this.emit([{ type: 'queued.delivered', count: n }]);
    // With a conversation, each message was already answered when it was sent.
    if (this.deps.converse) return;
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
    if (item?.type === 'review' && item.answer === undefined) {
      this.answerReview(item, answer);
      return;
    }
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

  /**
   * "Replay it": Fitts pauses, opens the page where it found the problem on the live site,
   * scrolls to the element and outlines it, and says what to look at. Resume carries on.
   */
  async showFinding(findingId: string): Promise<void> {
    const f = this.state.findings.find((x) => x.id === findingId);
    if (!f) return;
    if (this.state.activity === 'acting') this.setActivity('paused');
    if (this.state.rewindStep !== undefined) this.emit([{ type: 'rewind.set' }]);
    // A problem that only happens at one size is shown at that size (Allen's feedback, round 5).
    const device = f.seenOn ? DEVICES.find((d) => d.id === f.seenOn) : undefined;
    if (device) await this.deps.site.device?.(device.id).catch(() => null);
    try {
      await this.deps.site.navigate(f.route);
      if (f.elementRef) await this.deps.site.reveal?.(f.elementRef);
    } catch {
      this.say(format(copy.fitts.showFindingFailed, { route: f.route }));
      return;
    }
    this.emit([
      {
        type: 'overlay.set',
        overlays: {
          problems: this.state.overlays.problems,
          ...(f.elementRef
            ? {
                attention: {
                  ref: f.elementRef,
                  label: format(copy.fitts.showFindingLabel, { title: f.title }),
                },
              }
            : {}),
        },
      },
    ]);
    this.say(
      format(
        this.state.phase === 'done' ? copy.fitts.showFindingDone : copy.fitts.showFindingPaused,
        { title: f.title, route: f.route },
      ) + (device ? ` ${format(copy.fitts.showFindingDevice, { device: device.label })}` : ''),
    );
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
