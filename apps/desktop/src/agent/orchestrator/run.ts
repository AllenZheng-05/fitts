// The real audit (SPEC-phase2 §6): CRAWL as a step loop over the user's live site, with the
// coverage gate, stop/pause/queue, take the wheel, and edge states from real conditions.
// Probes (P5) run alongside it; reviewers (P6), the gate (P8) and fixes (P9) plug into this loop later.
import {
  DEVICES,
  isCatchAll,
  reduce,
  type AppModel,
  type Change,
  type ChatItem,
  type DeviceCell,
  type Finding,
  type Journey,
  type Observation,
  type RunCoverage,
  type EdgeStateKind,
  type MemoryRule,
  type Mode,
  type ProjectMemory,
  type RunEvent,
  type RunState,
  type SourceFrame,
} from '@fitts/schema';
import type { BudgetGuard } from '../ledger/budget';
import type { CostLedger } from '../ledger/ledger';
import {
  PAYMENT_HOST,
  type AxSnapshot,
  type HeldRequest,
  type OpTrace,
  type ReplayStep,
} from '../protocol';
import type { SiteRect } from '@fitts/schema';
import type { Site } from '../site-client';
import type { Action, Brain } from '../crawler/brain';
import { Coverage, DESTRUCTIVE, isPattern, patternOf, routeOf } from '../crawler/coverage';
import { pivotFrom, taskFrom } from '../crawler/focus';
import { chooseCells, mergeBreakpoints, widthsFromCss } from '../devices/matrix';
import { chooseStates, stateKey } from '../crawler/states';
import {
  buildRecord,
  noticeAction,
  noticeProbe,
  noticedSummary,
  observationsFor,
  recordLine,
  responseMs,
} from '../log/record';
import {
  FallbackJourneyBrain,
  PlanJourneyBrain,
  journeyOrder,
  runJourney,
  type JourneyBrain,
  type JourneyDeps,
} from '../crawler/journey';
import { copy } from '../../renderer/copy';
import { format } from '../../renderer/lib/format';
import { ProbeRunner } from '../crawler/probes';
import { aggregateWithChecks, type Check } from '../review/aggregate';
import { FixPipeline, type Fixer, type Redesigner, type TraceReplay } from '../fix/pipeline';
import type { ReviewCheckInput } from '../fix/review-check';
import { rootCauses } from '../fix/groups';
import {
  JUDGE_CAP,
  JUDGE_PERSONA,
  JUDGED,
  judgeDraft,
  type JudgeInput,
  type JudgeVerdict,
} from '../review/judge';
import type { PersonaReview, ReviewerPanel, RouteEvidence } from '../review/reviewers';
import type { SurpriseNote } from '@fitts/probes';
import { type Direction, type Inspiration, type ThemeFit } from '../review/themefit';
import { outlineSvg, type Media } from '../llm/media';
import { buildBoard, specFonts } from '@fitts/styles';
import { boardWords, solidPng } from './board-art';
import type { Converse } from './decider';
import { applyRules, memoryForReviewers, memoryLine, ruleFor } from '../memory/rules';
import { ownerFinding, plainDraft, type ReportDraft, type ReportInput } from './report';
import { buildRepro, oracleFor, pruneTrail, type TrailStep } from '../repro/repro';
import { confirm as confirmRepro, replaySteps, traceReplay } from '../repro/replay';
import { recheckFor, type Recheck } from '../fix/recheck';
import { maestroFlow } from '../repro/maestro';
import { BRAND_PERSONA, brandDraft, type BrandFit } from '../review/brandfit';

/** The Android app's id from a snapshot URL ("android://com.basilandember.order/menu"). */
const androidApp = (url: string | undefined) =>
  url?.startsWith('android://')
    ? url.slice('android://'.length).split('/')[0] || undefined
    : undefined;
import { playwrightTest } from '../repro/playwright';
import { titleOf } from '../review/aggregate';
import {
  ScriptedDecider,
  type AbilityName,
  type Decider,
  type Decision,
  type Outcome,
  type Situation,
} from './abilities';

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
  /** SPEC-phase4 §3: what Fitts understands from the code, when the project has one. */
  appModel?: AppModel;
  /** SPEC-phase4 §6.1: a brain for one journey (Spark with the screenshot); the plan itself without. */
  journeyBrain?: (journey: Journey) => JourneyBrain;
  /** SPEC-phase4 §6C: "Retry now" on the paused card: check the models right away. */
  retryModels?: () => void;
  /** SPEC-phase4 §4.3: what the owner told Fitts on earlier runs, and how to add to it. */
  memory?: {
    get(): ProjectMemory | undefined;
    add(rule: MemoryRule): void;
    forget(ruleId: string): void;
    taste(kind: 'likes' | 'dislikes', text: string): void;
  };
  /** SPEC-phase4 §4.2: the owner's words as a finding draft (a model); the plain draft without. */
  reportIssue?: (input: ReportInput, signal?: AbortSignal) => Promise<ReportDraft>;
  /** The reviewer panel (§8). Without one (no key, offline), probe findings stand alone. */
  panel?: ReviewerPanel;
  /** SAM outlines and Muse Image mockups (§10). Without it, the UI keeps DOM boxes. */
  media?: Media;
  /** The fixer (§9.2): without one (no key, offline), findings aren't fixed. */
  fixer?: Fixer;
  /** The redesigner (§8.3): applies a picked direction. Without one, directions are advice. */
  redesigner?: Redesigner;
  /** SPEC-phase4 §6B.5: the surprise judge (Muse Wonder over the moment's frames). */
  judge?: (input: JudgeInput) => Promise<JudgeVerdict | null>;
  /** SPEC-phase4 §7.5: "Checked by review" for a reviewer-only fix (Muse Wonder, before/after). */
  reviewCheck?: (input: ReviewCheckInput) => Promise<{ fixed: boolean; why: string }>;
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
  /** A9 (Nov 2): the theme check on Android, against the brand cues in the screens. */
  brandFit?: (
    input: { brief: RunState['brief']; shots: string[]; tokens: string[] },
    signal?: AbortSignal,
  ) => Promise<BrandFit | null>;
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
/** The device pass checks at most this many pages per cell (SPEC-phase4 §6.3). */
const MAX_CELL_PAGES = 12;
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
/** Files a text search may point a finding at (not a lockfile or a build). */
const SOURCE_FILE = /\.(tsx?|jsx?|vue|svelte|astro|html|css|scss)$/i;

/** "src/pages/Compose.tsx:118:9" → file, line and column. */
export function parseSrc(src: string): { file: string; line: number; col?: number } | null {
  const m = /^(.+?):(\d+)(?::(\d+))?$/.exec(src);
  if (!m?.[1]) return null;
  return { file: m[1], line: Number(m[2]), ...(m[3] ? { col: Number(m[3]) } : {}) };
}

export class RealRun {
  state: RunState;
  readonly coverage: Coverage;
  readonly probes: ProbeRunner;
  private items = 0;
  private finished = false;
  private wake: (() => void) | undefined;
  private abort = new AbortController();
  /**
   * SPEC-phase4 §6C: paused because Meta's models can't be reached. Nothing new starts (no site
   * action, probe, journey or fix) until they answer; the card's id, and what the run was doing.
   */
  private modelsPaused = false;
  private modelsCard: string | undefined;
  private beforeModels: RunState['activity'] | undefined;
  private modelsWaiters: (() => void)[] = [];
  private readonly history: string[] = [];
  /** Every step taken, for each finding's replay (Allen's feedback, round 4). */
  private readonly trail: TrailStep[] = [];
  /** The page as last seen by the crawl (roles and test ids for the trail's targets). */
  private lastSnap: AxSnapshot | undefined;
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
  /**
   * Abilities with nothing to do since the owner last spoke, and each one's last empty outcome:
   * a spent one is refused until the owner says something new (Allen, Nov 4: "run a journey",
   * ten times in a row, each "no journey left to try").
   */
  private readonly spent = new Map<AbilityName, string>();
  private readonly emptyLast = new Map<AbilityName, string>();
  /** Tasks the owner asked for so far (each one's id). */
  private tasks = 0;
  /** The owner asked Fitts to do something on the site: the next decision is that task. */
  private asked: string | undefined;
  /** The decider's last lines, by their opening words: the same line isn't said again and again. */
  private readonly lastSays: string[] = [];
  /** The gate card for a control that pays or places an order, waiting on the owner. */
  private payGate: { gateId: string; resolve: (yes: boolean) => void } | undefined;
  /** The order the owner allowed, while its tap runs: its own request isn't asked about again. */
  private allowedTap: { name: string; route: string } | undefined;
  /** SPEC-phase4 §6.1: each journey's status, by id. */
  private readonly journeyStatus = new Map<
    string,
    {
      status: 'planned' | 'running' | 'done' | 'failed' | 'blocked';
      reason?: string;
      steps?: number;
    }
  >();
  /** SPEC-phase4 §6.3: the device matrix, once the device pass chose it. */
  private cells: DeviceCell[] = [];
  /** SPEC-phase4 §7.5: each trace finding's confirmed repro, for checking its fix. */
  private readonly traceReplays = new Map<string, TraceReplay>();
  /** SPEC-phase4 §6B.5: the judge's pending looks, its votes and the moments it saw. */
  private readonly judging: Promise<void>[] = [];
  private readonly judgeReviews: PersonaReview[] = [];
  /** A9: the brand check's finding on Android, when the theme drifts from the brand. */
  private readonly brandReviews: PersonaReview[] = [];
  private readonly moments = new Map<string, NonNullable<Finding['moment']>>();
  private judged = 0;
  /** "Tapped “Send”": the last thing Fitts did, for the judge. */
  private lastAction: string | undefined;
  /** Each finding's repro steps as the replayer takes them (a dialog's recheck opens it). */
  private readonly reproSteps = new Map<string, ReplayStep[]>();
  /** SPEC-phase4 §6A: what Fitts noticed, in order; keys of probe notes already made. */
  private readonly observations: Observation[] = [];
  private readonly noted = new Set<string>();
  private obsN = 0;
  /** The cell the site is in during the device pass (notes say where). */
  private cellNow: string | undefined;
  /** The journey being run (its records say so). */
  private journeyNow: string | undefined;
  private readonly nextObsId = () => `obs-${++this.obsN}`;
  private cellsRun = 0;
  private lastCoverage = '';
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
  /** A fix was rolled back: the decider gets a say before the run settles (§1.6). */
  private nudged = false;
  /** Findings the decider already retried once: never twice. */
  private readonly deciderRetries = new Set<string>();
  /** FINALIZE has begun: the run's PR is opening, then Done. */
  private finishing = false;
  /** The finish proposal waiting on the owner (SPEC-phase4 §4.1), if one is open. */
  private proposalId: string | undefined;
  /** Fixes settled: the loop proposes finishing next (never finishes on its own). */
  private wantsProposal = false;
  /** Owner findings so far (their ids are numbered apart from the review's). */
  private ownerFindings = 0;
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
  /**
   * Controls the owner said "Don't do it" to, by page and name: never tapped again this run
   * (p9.bench, Nov 2: a journey whose plan said "Delete conversation" tapped it 272 times).
   */
  private readonly refused = new Set<string>();
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
      /** Each control's component chain (SPEC-phase4 §2.2), read on the first visit. */
      chains?: Record<string, SourceFrame[]>;
    }
  >();

  constructor(
    from: RunState,
    private readonly deps: RunDeps,
  ) {
    this.coverage = new Coverage(deps.origin);
    // SPEC-phase4 §6.2: the code's static routes are known before the first page; dynamic ones
    // wait for a real link. Journeys are planned from the model (priority 1 and 2 run first).
    for (const p of deps.appModel?.pages ?? [])
      if (!p.dynamic && !isPattern(p.route)) this.coverage.discover(p.route, 'code');
    const { first, later } = journeyOrder(deps.appModel?.journeys ?? []);
    for (const j of [...first, ...later]) this.journeyStatus.set(j.id, { status: 'planned' });
    this.probes = new ProbeRunner(
      deps.site,
      from.runId,
      (result) => {
        this.emit([{ type: 'probe.result', result }]);
        this.notice(
          noticeProbe(
            result,
            this.state.step,
            this.nextObsId,
            (ref) => this.lastSnap?.nodes.find((n) => n.ref === ref)?.name,
            this.noted,
            this.cellNow,
          ),
        );
      },
      (route, notes, clock) => {
        const observations: Observation[] = notes.map((n) => ({
          id: this.nextObsId(),
          step: this.state.step,
          route,
          ...(this.cellNow ? { cell: this.cellNow } : {}),
          kind: n.kind,
          text: format(copy.noticed.surprise, { measured: n.measured }),
          ...(n.ref ? { ref: n.ref } : {}),
          severityHint: n.kind === 'popped-up' || n.kind === 'jumped' ? 3 : 2,
        }));
        this.notice(observations);
        // SPEC-phase4 §6B.5: the judge looks at popped-up, jumped and scrolled moments.
        notes.forEach((n, i) => {
          const o = observations[i];
          if (o && clock !== undefined) this.judgeMoment(route, n, o.id, clock + n.at);
        });
      },
    );
    if (deps.appModel) {
      const model = deps.appModel;
      this.probes.needsFlow = (route) => {
        const page = model.pages.find((p) => p.route === route);
        return route.includes(':') || Boolean(page?.dynamic) || page?.gate === 'data';
      };
      this.probes.gated = (route) => {
        const page = model.pages.find((p) => p.route === route);
        return page?.gate === 'login' || page?.gate === 'role';
      };
    }
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
    if (this.journeyStatus.size)
      this.emit([{ type: 'run.patch', patch: { journeys: this.journeyList() } }]);
    this.syncCoverage();
    this.say('Looking around your site now. I’ll try every control on every page I can reach.');
    const remembered = memoryLine(this.deps.memory?.get());
    if (remembered) this.say(format(copy.fitts.remembered, { what: remembered }));
    if (this.state.brief.avoid) this.deps.memory?.taste('dislikes', this.state.brief.avoid);
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
    // What popped up or moved while the owner was talking to Fitts (the site was open during
    // the interview) is read before the audit's first load replaces the page (bench:chat, Nov 2:
    // demo/chat's "Rate us" shows once, 4 s after the inbox opens). Events carry their own page.
    void this.probes
      .surprise('/')
      .catch(() => undefined)
      .finally(() => void this.loop());
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
        if (a === 'stop') return this.finish({ stop: true });
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
    return this.modelsPaused || a === 'paused' || a === 'user-driving' || a === 'waiting-on-user';
  }

  /** Resolves when the models answer (at once when they do): fixes wait here (§6C). */
  private untilModels(): Promise<void> {
    if (!this.modelsPaused || this.finished) return Promise.resolve();
    return new Promise((resolve) => this.modelsWaiters.push(resolve));
  }

  /**
   * SPEC-phase4 §6C: a model call found Meta's models unreachable. The run pauses at once and
   * says so; the call itself waits in the caller and is sent again when they answer. Only the
   * owner's Stop ends the run while it's paused.
   */
  modelsDown(): void {
    if (this.finished || this.modelsPaused) return;
    this.modelsPaused = true;
    this.beforeModels = this.state.activity;
    this.modelsCard = this.card(
      'api-trouble',
      (a) => {
        if (a === 'stop') this.finish({ stop: true });
      },
      false,
    );
    this.setActivity('paused');
    this.emit([
      { type: 'now.changed', nowText: copy.fitts.modelsPausedNow },
      { type: 'run.patch', patch: { modelsDownSince: Date.now() } },
    ]);
  }

  /** The models answer again: the run picks up exactly where it was (§6C). */
  modelsUp(): void {
    if (!this.modelsPaused) return;
    this.modelsPaused = false;
    const id = this.modelsCard;
    this.modelsCard = undefined;
    const item = id ? this.state.chat.find((c) => c.id === id) : undefined;
    if (id) this.handlers.delete(id);
    if (item?.type === 'state' && item.answer === undefined)
      this.emit([{ type: 'chat.item.updated', item: { ...item, answer: 'reconnected' } }]);
    this.emit([{ type: 'run.patch', patch: {}, unset: ['modelsDownSince'] }]);
    if (this.finished) return;
    this.say(copy.fitts.apiRecovered);
    // Back to what it was doing, unless the owner paused or took the wheel meanwhile.
    if (this.state.activity === 'paused') {
      const before = this.beforeModels;
      this.setActivity(
        before === 'waiting-on-user' || this.state.waitingFor
          ? 'waiting-on-user'
          : before === 'paused' || before === 'user-driving'
            ? before
            : 'acting',
      );
    }
    this.beforeModels = undefined;
    const waiters = this.modelsWaiters;
    this.modelsWaiters = [];
    for (const w of waiters) w();
    this.kick();
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
      // (Allen's feedback, round 6), and so does a rolled-back fix (Allen's feedback, run 1:
      // a failed check is a reason to think, not to give up). Otherwise there's nothing to decide.
      const news = this.inbox.length > 0 || this.nudged || this.wantsProposal;
      const listening = this.fixPhase && news && this.state.activity !== 'paused';
      if ((this.blocked() && !listening) || (this.fixPhase && !news)) {
        await this.sleepUntilKicked();
        continue;
      }
      // Fixes settled (or a card was answered with nothing to do): propose finishing. The
      // proposal is the loop's, not the decider's: a decider may never end a run (§4.1).
      if (this.wantsProposal && this.inbox.length === 0 && !this.nudged) {
        this.wantsProposal = false;
        const outcome = await this.use({ ability: 'propose_finish' });
        this.recent.push(outcome);
        if (this.recent.length > RECENT) this.recent.shift();
        continue;
      }
      this.deliverQueued();
      // A new request from the owner: what had nothing to do before may have something now.
      if (this.inbox.length > 0) {
        this.spent.clear();
        this.emptyLast.clear();
      }
      const situation = this.situation();
      this.nudged = false;
      this.heard.push(...this.inbox);
      this.inbox = [];
      // What the owner asked Fitts to do is the next thing it does, in code (Allen, Nov 4).
      const asked = this.asked;
      this.asked = undefined;
      // A real decision takes a moment: the Now line says what Fitts is doing meanwhile.
      if (this.deps.decider && !refused)
        this.emit([{ type: 'now.changed', nowText: 'Thinking about what’s next' }]);
      let decision: Decision;
      if (asked) decision = { ability: 'task', goal: asked, why: 'The owner asked for it' };
      else
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
      // The same line again ("Staying on checkout as you asked", 20 times in a row on Nov 4)
      // is noise: a line that opens like one of the last few isn't said.
      if (decision.say && !refusal) {
        const opening = decision.say
          .toLowerCase()
          .replace(/[^a-z0-9 ]+/g, ' ')
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .join(' ');
        if (!this.lastSays.includes(opening)) this.say(decision.say);
        this.lastSays.push(opening);
        if (this.lastSays.length > 6) this.lastSays.shift();
      }
      if (decision.why && !refusal) this.logDetail('thinking', decision.why);
      const passName = copy.fitts.abilityNames[decision.ability] ?? decision.ability;
      if (!refusal) this.logDetail('pass', format(copy.fitts.passStarted, { name: passName }));
      this.emit([
        {
          type: 'ability.changed',
          ability: { name: decision.ability, since: this.state.elapsedMs },
        },
      ]);
      const before = this.progress();
      const outcome = refusal
        ? { ability: decision.ability, result: 'refused' as const, note: refusal }
        : await this.use(decision);
      if (!refusal) this.noteEmpty(outcome, before);
      if (!this.finished) this.emit([{ type: 'ability.changed' }]);
      if (!refusal && !this.finished)
        this.logDetail(
          'pass',
          format(copy.fitts.passEnded, {
            name: passName,
            result: copy.fitts.passResults[outcome.result] ?? outcome.result,
          }) + (outcome.note ? ` (${outcome.note})` : ''),
        );
      refused = outcome.result === 'refused';
      this.recent.push(outcome);
      if (this.recent.length > RECENT) this.recent.shift();
      // A decision after a rollback that didn't start anything: the fixes have settled.
      if (this.fixPhase) this.fixesSettled();
    }
  }

  /**
   * Why a step can't run yet, or undefined (§1.6). The audit's checks need the site explored
   * first: run before, they'd look at nothing, find nothing and count as done (Allen's
   * feedback, round 7: a redesign brief sent the decider straight to them).
   */
  private refusal(d: Decision): string | undefined {
    if (this.spent.has(d.ability))
      return `it had nothing to do (${this.spent.get(d.ability) ?? ''}); pick something else until the owner speaks`;
    const needsPages: AbilityName[] = [
      'device_pass',
      'check_links',
      'state_pass',
      'perf_pass',
      'review',
      'looks',
      'fix',
    ];
    if (needsPages.includes(d.ability) && !this.crawlEnded)
      return 'explore first: the crawl hasn’t finished';
    if (d.ability === 'check_theme' && this.pages.size === 0)
      return 'explore first: no page has been seen yet';
    // Once fixes are underway the audit is over: what's left is the fixes and the owner.
    const audit: AbilityName[] = [
      'explore',
      'journey',
      'task',
      'device_pass',
      'check_links',
      'state_pass',
      'perf_pass',
      'review',
      'check_theme',
    ];
    if (this.fixPhase && audit.includes(d.ability)) return 'fixes are underway; the audit is over';
    return undefined;
  }

  /** What moved since: steps, pages, findings, notes and journeys. An ability that moves none did nothing. */
  private progress(): string {
    return [
      this.state.step,
      this.pages.size,
      this.state.findings.length,
      this.observations.length,
      this.coverage.controlsTried().done,
      [...this.journeyStatus.values()].map((j) => j.status).join(','),
    ].join('|');
  }

  /**
   * An ability that had nothing to do, or did the same nothing twice, is spent until the owner
   * speaks: Fitts says so once, and the decider picks something else (Allen, Nov 4). Lives here,
   * not in the decider, so no decider can spin on it.
   */
  private noteEmpty(outcome: Outcome, before: string): void {
    const a = outcome.ability;
    if (outcome.result === 'refused' || outcome.result === 'done' || this.finished) return;
    // Exploring ends itself (covered, circling, the ceiling); spent, it would leave the checks
    // refused with nothing to explore first.
    if (a === 'explore') return;
    // Paused or stopped mid-way, or the owner spoke: not the ability's emptiness.
    if (this.inbox.length > 0 || outcome.note === 'interrupted') return;
    const key = `${outcome.result}|${outcome.note ?? ''}`;
    const nothing = outcome.result === 'nothing';
    const twice = !nothing && this.progress() === before && this.emptyLast.get(a) === key;
    if (!nothing && this.progress() !== before) {
      this.emptyLast.delete(a);
      return;
    }
    if (!nothing && !twice) {
      this.emptyLast.set(a, key);
      return;
    }
    const note = outcome.note ?? (nothing ? copy.fitts.spentNothing : copy.fitts.spentTwice);
    this.spent.set(a, note);
    if (!this.ran[a])
      this.say(
        format(copy.fitts.spentAbility, {
          name: copy.fitts.abilityNames[a] ?? a,
          note: twice ? copy.fitts.spentTwice : note,
        }),
      );
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
      case 'journey':
        return this.journey(d);
      case 'task':
        return this.task(d);
      case 'device_pass':
        await this.devicePass();
        this.ran.device_pass = true;
        return outcome('done');
      case 'state_pass':
        if (live) {
          this.ran.state_pass = true;
          return outcome('nothing', 'a live site is never altered, not even in the browser');
        }
        this.emit([{ type: 'now.changed', nowText: copy.fitts.statePassNow }]);
        await this.probes.statePass(this.deps.origin, (s) =>
          this.addState(s.route, s.label, s.jpegBase64),
        );
        this.ran.state_pass = true;
        return outcome('done');
      case 'perf_pass': {
        this.emit([{ type: 'now.changed', nowText: copy.fitts.perfPassNow }]);
        const journeyPages = (this.deps.appModel?.journeys ?? []).flatMap((j) => j.pages);
        const routes = [
          ...new Set([...journeyPages.filter((r) => this.pages.has(r)), ...this.pages.keys()]),
        ].filter((r) => !FILE_ROUTE.test(r) && !isPattern(r) && this.coverage.inFocus(r));
        await this.probes.perfPass(routes);
        this.ran.perf_pass = true;
        return outcome('done');
      }
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
        if (!this.themeAsked && (this.deps.themeFit || this.deps.brandFit) && this.pages.size > 0) {
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
        this.dismissFinding(f.id, copy.finding.dismissMenu.reasons.wrong);
        return outcome('done', f.title);
      }
      case 'retry_fix': {
        if (live) return outcome('refused', 'a live site can’t be changed');
        if (this.state.mode === 'plan') return outcome('refused', 'Plan only never changes code');
        const id = d.findingId ?? '';
        const change = this.state.changes.find(
          (c) => c.status === 'rolled-back' && c.findingIds.includes(id),
        );
        if (!change) return outcome('refused', 'no rolled-back fix for that finding');
        if (this.deciderRetries.has(id))
          return outcome(
            'refused',
            'that fix was already retried once; leave it, or tell the owner',
          );
        // The ask modes ask, as they do before any fix.
        if (
          (this.state.mode === 'ask-every' || this.state.mode === 'ask-unsure') &&
          !(await this.ask(
            `“${change.title}” didn’t pass: ${change.reason ?? 'it was rolled back'}. Can I try it again${d.hint ? ` (${d.hint})` : ' with a different approach'}?`,
          ))
        )
          return outcome('nothing', 'the owner said to leave it');
        this.deciderRetries.add(id);
        await this.pipeline?.retry(change.id, d.hint);
        return outcome('done', change.title);
      }
      case 'propose_finish':
        // Fixes still running or waiting on the owner: the proposal comes when they settle.
        if (this.fixPhase && (this.approvalId !== undefined || this.pipeline?.busy))
          return outcome('refused', 'fixes are still going; propose once they settle');
        if (this.proposalId) return outcome('refused', 'already proposed; the owner decides');
        if (!this.fixPhase) {
          // Every page and control is tried or skipped first, unless the crawl can't go on.
          if (!this.coverage.complete() && !this.crawlEnded)
            return outcome('refused', 'pages and controls are left to try');
          // And the audit's own checks have run: a run never ends unreviewed.
          for (const owed of [
            'device_pass',
            'check_links',
            'state_pass',
            'perf_pass',
            'review',
          ] as const)
            if (!this.ran[owed]) return outcome('refused', `${owed} hasn’t run yet`);
          this.crawlComplete();
        }
        this.propose();
        return outcome('done', 'proposed');
      case 'report_issue':
        return this.reportIssue(d);
      default:
        // A fake or broken decider naming something that isn't an ability: refused, never a crash.
        return outcome('refused', `unknown ability ${String(d.ability)}`);
    }
  }

  /**
   * The finish proposal (SPEC-phase4 §4.1): Fitts thinks it's done and says what it covered,
   * found, fixed and left; the owner's Finish is the only way to Done from here (Stop and the
   * budget card's Stop are the others). Any message closes it and goes to the decider.
   */
  private propose(): void {
    if (this.proposalId || this.finished) return;
    const id = this.id();
    this.proposalId = id;
    this.emit([
      { type: 'chat.item', item: { id, type: 'finish-proposal' } },
      { type: 'waiting.changed', waitingFor: 'finish-proposal' },
      { type: 'now.changed', nowText: copy.fitts.proposalWaiting },
    ]);
    this.setActivity('waiting-on-user');
  }

  /** The proposal's answer: finish, fix the rest, or carry on. */
  private answerProposal(
    item: Extract<ChatItem, { type: 'finish-proposal' }>,
    answer: string,
  ): void {
    if (this.proposalId !== item.id) return;
    const a = answer === 'finish' || answer === 'fix-rest' ? answer : 'continue';
    this.proposalId = undefined;
    this.emit([{ type: 'chat.item.updated', item: { ...item, answer: a } }]);
    if (this.state.waitingFor === 'finish-proposal') this.emit([{ type: 'waiting.changed' }]);
    this.emit([{ type: 'now.changed' }]);
    if (a === 'finish') {
      this.finish();
      return;
    }
    if (!this.finished) this.setActivity('acting');
    if (a === 'fix-rest') this.approveFixes(this.openFixable());
    else this.kick();
  }

  /** Open, fixable findings (what "Fix the rest" starts). */
  private openFixable(): string[] {
    const open = this.state.findings
      .filter((f) => (f.lane ?? 'shown') === 'shown' && f.status === 'open')
      .map((f) => f.id);
    return this.pipeline ? this.pipeline.fixable(open) : [];
  }

  /**
   * The owner reports an issue (SPEC-phase4 §4.2): their words become a finding of theirs,
   * shown, pinned, with the element's source and a memory rule. Never argued down.
   */
  private async reportIssue(d: Decision): Promise<Outcome> {
    const outcome = (result: Outcome['result'], note?: string): Outcome => ({
      ability: 'report_issue',
      result,
      ...(note ? { note } : {}),
    });
    const text = (d.text ?? this.heard.at(-1) ?? '')
      .replace(/\s*\[pointing at ref[^\]]*\]\s*$/, '')
      .trim();
    if (!text) return outcome('refused', 'nothing to report: the owner said nothing');
    let route = d.route ? routeOf(d.route) : undefined;
    if (!route) {
      const snap = await this.deps.site.snapshot().catch(() => undefined);
      route = snap
        ? routeOf(snap.path)
        : (this.state.routes.find((r) => r.status === 'testing')?.path ?? '/');
    }
    const node = d.ref
      ? [...this.pages.values()]
          .flatMap((p) => p.evidence.snapshot.nodes)
          .find((n) => n.ref === d.ref)
      : undefined;
    const input: ReportInput = {
      text,
      route,
      ...(d.ref
        ? { element: { ref: d.ref, role: node?.role ?? 'element', name: node?.name ?? '' } }
        : {}),
      brief: { ...this.state.brief },
    };
    this.emit([{ type: 'now.changed', nowText: 'Writing up what you reported' }]);
    let draft: ReportDraft;
    try {
      draft = this.deps.reportIssue
        ? await this.deps.reportIssue(input, this.abort.signal)
        : plainDraft(input);
    } catch {
      draft = plainDraft(input);
    }
    if (this.finished) return outcome('nothing');
    this.ownerFindings += 1;
    const page = this.pages.get(route);
    let finding = ownerFinding(
      `${this.state.runId}-o${this.ownerFindings}`,
      this.state.runId,
      draft,
      input,
      {
        stepIndex: page?.stepIndex ?? this.state.step,
        atMs: page?.atMs ?? this.state.elapsedMs,
      },
    );
    finding = await this.withSource(finding);
    this.post([finding]);
    void this.evidence([finding]).then(() => this.repro(finding));
    this.deps.memory?.add(
      ruleFor('is-a-problem', finding, undefined, text.slice(0, 200), this.state.runId),
    );
    this.say(format(copy.fitts.reported, { title: finding.title }));
    this.emit([{ type: 'now.changed' }]);
    return outcome('done', finding.title);
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
      ...(this.spent.size ? { spent: [...this.spent.keys()] } : {}),
      changes: this.state.changes
        .filter((c) => c.kind !== 'wording')
        .slice(-8)
        .map((c) => ({
          id: c.id,
          ...(c.findingIds[0] ? { findingId: c.findingIds[0] } : {}),
          title: c.title.slice(0, 80),
          status: c.status,
          ...(c.reason ? { reason: c.reason.slice(0, 160) } : {}),
          ...(c.attempts !== undefined ? { attempts: c.attempts } : {}),
        })),
      recent: [...this.recent],
      messages: [...this.inbox],
      earlier: this.heard.slice(-10),
      budget: { spentUsd: this.state.cost.spentUsd, capUsd: this.state.cost.capUsd },
      ...(this.journeyStatus.size ? { journeys: this.journeyList() } : {}),
      ...(this.observations.length ? { noticed: noticedSummary(this.observations) } : {}),
      ...(memoryLine(this.deps.memory?.get())
        ? {
            memory: `The owner told you on earlier runs: ${memoryLine(this.deps.memory?.get()) ?? ''}`,
          }
        : {}),
      ...(this.deps.appModel
        ? {
            app: {
              summary: this.deps.appModel.summary.slice(0, 600),
              pages: this.deps.appModel.pages.map(
                (p) => `${p.route}${p.gate ? ` (needs ${p.gate})` : ''}`,
              ),
              journeys: this.deps.appModel.journeys
                .filter((j) => j.enabled !== false)
                .map((j) => `${j.name} (${j.start}, priority ${j.priority})`),
            },
          }
        : {}),
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
    // A page that's already covered isn't opened again: the crawl carries on where it is
    // (Nov 4: "explore /checkout" picked again and again once checkout was covered).
    if (
      route &&
      !isPattern(route) &&
      this.coverage.inFocus(route) &&
      !(this.pages.has(routeOf(route)) && this.coverage.routeDone(route))
    ) {
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
      if (
        this.pages.size >= THEME_ROUTES &&
        !this.themeAsked &&
        (this.deps.themeFit || this.deps.brandFit)
      ) {
        this.themeAsked = true;
        this.themeCheck = this.checkTheme();
      }
      if (this.blocked() || this.finished) continue;

      const here = routeOf(snap.path);
      startedOn ??= here;
      this.lastSnap = snap;
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
      .filter((f) => (f.lane ?? 'shown') === 'shown' && f.status === 'open')
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
        `Fixing ${fixable.length} of these now. Each one is checked before it goes on the run’s branch.`,
      );
      this.pipeline.start(fixable);
      return true;
    }
    const serious = this.state.findings.filter(
      (f) => fixable.includes(f.id) && f.severity >= 3,
    ).length;
    const id = this.id();
    this.approvalId = id;
    const groups = rootCauses(
      this.state.findings.filter((f) => fixable.includes(f.id)),
      (f) => this.checks.get(f.id)?.title,
    );
    this.emit([
      {
        type: 'chat.item',
        item: {
          id,
          type: 'approval.batch',
          findingIds: fixable,
          serious,
          ...(groups.length ? { groups } : {}),
        },
      },
      { type: 'waiting.changed', waitingFor: 'approval' },
    ]);
    this.setActivity('waiting-on-user');
    return true;
  }

  /** Approve the batch, or "Fix it" on one finding (§9.3: approving covers its PR). */
  approveFixes(findingIds: string[]): void {
    if (!this.pipeline) return;
    // §14: what the owner said is fine (owner-ok) is never fixed, whoever asks.
    findingIds = findingIds.filter(
      (id) => (this.state.findings.find((f) => f.id === id)?.lane ?? 'shown') === 'shown',
    );
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
    // What Fitts can't check a fix for, it says so instead of quietly doing nothing. The owner
    // asked for these themselves, so reviewer-only findings can be "Checked by review" (§7.5).
    const fixable = this.pipeline.fixable(findingIds, { owner: true });
    const cant = this.state.findings.filter(
      (f) => findingIds.includes(f.id) && !fixable.includes(f.id),
    );
    for (const f of cant.slice(0, 3))
      this.say(format(copy.fitts.cantFix, { title: f.title, fix: f.fix }));
    if (fixable.length === 0) return;
    this.fixPhase = true;
    this.pipeline.start(fixable, { owner: true });
    if (!this.pipeline.busy) this.fixesSettled();
  }

  /** "It is a problem": a dismissed finding is open again, with its pin back on the page. */
  reopenFinding(findingId: string): void {
    const f = this.state.findings.find((x) => x.id === findingId);
    if (!f || (f.status !== 'dismissed' && f.lane !== 'owner-ok')) return;
    // The rule that kept it out (or the reason just given) goes; it's a finding again.
    this.deps.memory?.forget(
      ruleFor('not-a-problem', f, this.checks.get(f.id)?.probe, '', this.state.runId).id,
    );
    const pin = this.state.overlays.problems.length + 1;
    const reopened: Finding = { ...f, status: 'open' };
    delete reopened.ownerReason;
    if (reopened.lane === 'owner-ok') reopened.lane = 'shown';
    this.emit([
      { type: 'finding.updated', finding: reopened },
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

  /**
   * Not a problem (SPEC-phase4 §4.2): with the owner's reason it's remembered for this project,
   * so the same finding stays out of the shown lane on later runs (§4.3).
   */
  dismissFinding(findingId: string, reason?: string): void {
    const f = this.state.findings.find((x) => x.id === findingId);
    if (!f) return;
    const why = reason?.trim().slice(0, 200);
    this.emit([
      {
        type: 'finding.updated',
        finding: { ...f, status: 'dismissed', ...(why ? { ownerReason: why } : {}) },
      },
      {
        type: 'overlay.set',
        overlays: {
          ...this.state.overlays,
          problems: this.state.overlays.problems.filter((p) => p.ref !== f.elementRef),
        },
      },
    ]);
    if (why) {
      this.deps.memory?.add(
        ruleFor('not-a-problem', f, this.checks.get(f.id)?.probe, why, this.state.runId),
      );
      this.say(format(copy.fitts.dismissNoted, { reason: why.toLowerCase() }));
    } else this.say(copy.fitts.dismissFollowUp);
  }

  /** "This matters more/less": the owner's severity, remembered (§4.2). */
  private weigh(f: Finding, delta: 1 | -1): void {
    const severity = Math.max(1, Math.min(4, f.severity + delta)) as Finding['severity'];
    if (severity === f.severity) return;
    this.emit([{ type: 'finding.updated', finding: { ...f, severity } }]);
    this.deps.memory?.add(
      ruleFor(
        'severity',
        f,
        this.checks.get(f.id)?.probe,
        delta > 0 ? 'This matters more' : 'This matters less',
        this.state.runId,
        delta,
      ),
    );
    this.say(format(copy.fitts.severityNoted, { title: f.title, n: severity }));
  }

  retryChange(changeId: string, hint?: string): void {
    void this.pipeline?.retry(changeId, hint);
  }

  undoChange(changeId: string): void {
    void this.pipeline
      ?.undo(changeId)
      .catch((e: unknown) => this.say(`I couldn’t undo that: ${(e as Error).message}`));
  }

  /**
   * Every fix has settled: FINALIZE (the run's one PR, then Done), once. Not while a rollback
   * waits for the decider's say: it may retry, and the loop calls this after it decides.
   */
  private fixesSettled(): void {
    if (this.approvalId || this.pipeline?.busy || this.nudged || !this.fixPhase) return;
    if (this.proposalId || this.finished) return;
    this.wantsProposal = true;
    this.kick();
  }

  /**
   * A change settled: verified, or rolled back with why. The decider hears about both in
   * `recent`, and a rollback wakes it (with a real decider) to weigh a retry before the run ends.
   */
  private changeSettled(change: Change): void {
    const verified = change.status === 'verified';
    this.recent.push({
      ability: 'fix',
      result: verified ? 'done' : 'nothing',
      note: verified
        ? `verified “${change.title}”`
        : `rolled back “${change.title}”: ${change.reason ?? ''}`,
    });
    if (this.recent.length > RECENT) this.recent.shift();
    if (!verified && this.deps.decider && !this.finished) {
      this.nudged = true;
      this.kick();
    }
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
    if (this.pages.has(route)) {
      await this.rememberState(snap);
      return;
    }
    this.stateKeys.add(stateKey(snap));
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
    // Where each control, and each element a probe flagged, is rendered, while the page is here
    // (SPEC-phase4 §2.2): a probe's element is often no control (a stamp, a "To:" line).
    const chainRefs = new Set([
      ...snap.nodes.map((n) => n.ref),
      ...this.probes.results
        .filter((r) => r.route === route)
        .flatMap((r) => r.items.map((i) => i.ref)),
    ]);
    const chains = await this.deps.site
      .sourcesOf?.([...chainRefs].filter(Boolean))
      .catch(() => undefined);
    this.pages.set(route, {
      evidence: { route, snapshot: snap, trace: [], ...(shot ? { shot } : {}) },
      stepIndex: this.state.step,
      atMs: this.state.elapsedMs,
      ...(size ? { size } : {}),
      ...(rects ? { rects } : {}),
      ...(chains && Object.keys(chains).length ? { chains } : {}),
    });
  }

  /** SPEC-phase4 §6B.3: the states seen (route + controls + dialogs + headings). */
  private readonly stateKeys = new Set<string>();

  /** A page's new state: its own probes (axe, contrast, target size, leaks) and a shot. */
  private async rememberState(snap: AxSnapshot): Promise<void> {
    const key = stateKey(snap);
    if (this.stateKeys.has(key)) return;
    this.stateKeys.add(key);
    const route = routeOf(snap.path);
    const page = this.pages.get(route);
    if (!page || (page.evidence.states?.length ?? 0) >= 12) return;
    const dialog = snap.nodes.some((n) => n.region === 'dialog');
    const label = format(copy.fitts.stateAfter, {
      what: this.history.at(-1)?.split(' · ')[0] ?? 'looking around',
    });
    try {
      const results = await this.deps.site.probes([
        'axe',
        'contrast',
        'target-size',
        'placeholder-leak',
      ]);
      for (const r of results) if (!r.pass) this.probes.addState(r, route, label);
    } catch {
      // Best effort.
    }
    let jpegBase64: string | undefined;
    if (this.deps.panel)
      jpegBase64 = (await this.deps.site.screenshot().catch(() => null))?.jpegBase64;
    this.addState(route, label, jpegBase64, { dialog, key });
  }

  /** Adds a state to its page's evidence (state_pass's and the crawl's alike). */
  private addState(
    route: string,
    label: string,
    jpegBase64?: string,
    more: { dialog?: boolean; error?: boolean; key?: string } = {},
  ): void {
    const page = this.pages.get(route);
    if (!page) return;
    const states = page.evidence.states ?? [];
    states.push({
      key: more.key ?? `${route}#${label}`,
      label,
      stepIndex: this.state.step,
      ...(jpegBase64 ? { shot: { jpegBase64 } } : {}),
      ...(more.dialog ? { dialog: true } : {}),
      ...(more.error || /fails/.test(label) ? { error: true } : {}),
    });
    page.evidence.states = states;
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
    // The order the owner just allowed on the gate card.
    if (
      action.kind === 'click' &&
      this.allowedTap?.name === action.name &&
      this.allowedTap.route === routeOf(from)
    )
      return true;
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
  /**
   * SPEC-phase4 §6A.3: a line only "Every detail" shows: the decider's why ("Thinking: …"), or
   * an ability starting and ending. Appended to the current steps group like an action.
   */
  private logDetail(detail: 'thinking' | 'pass', label: string): void {
    this.logAction(label, detail);
  }

  private logAction(label: string, detail?: 'thinking' | 'pass'): void {
    const last = this.state.chat.at(-1);
    const current = this.stepsItem && last?.id === this.stepsItem.id ? this.stepsItem : undefined;
    const steps = [
      ...(current?.steps ?? []),
      { label, costUsd: 0, ...(detail ? { detail } : {}) },
    ].slice(-200);
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

  /** ask(), with the question's chat item: main checks the owner's own answer to it (§7.3). */
  private askItem(text: string): Promise<{ yes: boolean; itemId: string }> {
    let itemId = '';
    return this.choose(text, [copy.fitts.goAhead, copy.fitts.skipIt], (id) => {
      itemId = id;
    }).then((answer) => ({ yes: answer === copy.fitts.goAhead, itemId }));
  }

  /**
   * SPEC-phase4 §6B.5: one surprise moment judged. The frames 2 s each side are saved as assets
   * (at most 8), Muse Wonder judges them with the last action and the brief, and SAM outlines
   * the element on the first and last (the DOM box when it can't). Unexpected → the judge's
   * draft, citing the observation. At most JUDGE_CAP per run; first-load banners are already
   * once per site (the probe runner). An unreadable answer leaves the note a note.
   */
  private judgeMoment(route: string, note: SurpriseNote, obsId: string, at: number): void {
    const judge = this.deps.judge;
    const frames = this.deps.site.frames?.bind(this.deps.site);
    if (!judge || !frames || !JUDGED.has(note.kind) || this.judged >= JUDGE_CAP) return;
    this.judged += 1;
    const lastAction = this.lastAction;
    const look = async () => {
      let shots = await frames(at).catch(() => []);
      // Older than the ring (read before the audit: it popped up during the interview): what
      // the page shows now, while the thing is still there, is the evidence.
      if (shots.length === 0) {
        const now = await this.deps.site.screenshot().catch(() => undefined);
        if (now?.jpegBase64) shots = [{ at: Date.now(), ...now }];
      }
      if (shots.length === 0 || this.finished) return;
      const first = shots[0];
      const last = shots.at(-1);
      if (!first || !last) return;
      const saved: { t: number; url: string }[] = [];
      for (const [i, s] of shots.entries()) {
        const url = await this.deps.site
          .saveAsset(this.state.runId, `moment-${obsId}-${i}.jpg`, s.jpegBase64)
          .catch(() => undefined);
        if (url) saved.push({ t: s.at - at, url });
      }
      const verdict = await judge({
        note,
        route,
        frames: shots.map((s) => ({ t: s.at - at, jpegBase64: s.jpegBase64 })),
        ...(lastAction ? { lastAction } : {}),
        brief: this.state.brief,
      });
      if (!verdict || verdict.expected) return;
      this.judgeReviews.push({
        route,
        persona: JUDGE_PERSONA,
        drafts: [judgeDraft(note, verdict, obsId)],
      });
      const box = note.ref
        ? await this.deps.site
            .rects([note.ref])
            .then((r) => r[note.ref])
            .catch(() => undefined)
        : undefined;
      const moment: NonNullable<Finding['moment']> = {
        frames: saved,
        width: first.width,
        height: first.height,
        ...(box ? { box } : {}),
      };
      this.moments.set(obsId, moment);
      // SAM on the first and last frames; a failure keeps the DOM box, silently.
      const media = this.deps.media;
      if (!media || !box) return;
      const ctx = {
        runId: this.state.runId,
        projectId: this.state.projectId,
        allowed: () => this.allowed(),
      };
      const outlines: { first?: string; last?: string } = {};
      for (const [key, shot] of [
        ['first', first],
        ['last', last],
      ] as const) {
        const path = await media
          .outline(
            ctx,
            { jpegBase64: shot.jpegBase64, width: shot.width, height: shot.height },
            box,
          )
          .catch(() => null);
        if (!path) continue;
        const url = await this.deps.site
          .saveAsset(
            this.state.runId,
            `moment-${obsId}-${key}.svg`,
            Buffer.from(outlineSvg(path, shot.width, shot.height)).toString('base64'),
          )
          .catch(() => undefined);
        if (url) outlines[key] = url;
      }
      if (outlines.first || outlines.last) moment.outlines = outlines;
    };
    this.judging.push(look().catch(() => undefined));
  }

  /** A navigation or keyboard finding's own check, to run again on a fix's worktree. */
  private recheckOf(id: string): Recheck | undefined {
    const check = this.checks.get(id);
    if (!check || (check.probe !== 'navigation' && check.probe !== 'keyboard')) return undefined;
    const probe = check.probe;
    const hit = this.probes.results
      .filter((r) => r.probe === probe && !r.pass && (r.device ?? undefined) === check.device)
      .flatMap((r) => r.items.map((i) => ({ i, route: r.route })))
      .find((x) => titleOf(probe, x.i) === check.title);
    if (!hit) return undefined;
    return recheckFor(probe, hit.i, hit.route, {
      headings: (route) => this.probes.headings(route),
      needsFlow: (route) => this.probes.needsFlow(route),
      steps: this.reproSteps.get(id) ?? [],
    });
  }

  /** A device cell of this run (or a built-in device) by id. */
  private cellFor(id: string): DeviceCell | undefined {
    const device = DEVICES.find((d) => d.id === id);
    return (
      this.cells.find((c) => c.id === id) ??
      (device ? { ...device, touch: device.mobile } : undefined)
    );
  }

  /**
   * A blocking question with its own buttons; resolves with the one pressed, or the last option
   * (the "no") when the run moves on without an answer.
   */
  private choose(text: string, options: string[], onId?: (id: string) => void): Promise<string> {
    const no = options[options.length - 1] ?? '';
    return new Promise((resolve) => {
      const id = this.id();
      onId?.(id);
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
    // A real payment provider is never sent a request, whatever was allowed (Allen, Nov 4).
    let host = '';
    try {
      host = new URL(held.url).host;
    } catch {
      // No host: not a provider.
    }
    if (host && PAYMENT_HOST.test(host)) {
      void this.deps.site.release(held.id, false);
      this.say(format(copy.fitts.providerHeld, { host }));
      return;
    }
    // The order the owner just allowed on the gate card: its own request isn't asked again.
    if (this.allowedTap && this.acting?.name === this.allowedTap.name) {
      void this.deps.site.release(held.id, true);
      return;
    }
    if (this.state.mode === 'dangerous' && isLocal(this.deps.origin)) {
      void this.deps.site.release(held.id, true);
      this.say(format(copy.fitts.gateSkippedDangerous, { action }));
      return;
    }
    const gateId = `gate-${held.id}`;
    this.heldReq = { held, gateId };
    // The hold is evidence: the tap sent it straight away, with nothing asking first. Without
    // this the reviewers saw only what followed a "Don't do it" (bench:chat, Nov 2: "Delete
    // conversation does nothing" instead of #16, "deletes instantly").
    if (held.method !== 'TAP')
      this.notice([
        {
          id: this.nextObsId(),
          step: this.state.step,
          route: this.acting?.route ?? routeOf(this.lastSnap?.path ?? '/'),
          kind: 'no-confirm',
          text: format(copy.noticed.noConfirm, { name: action, request: `${held.method} ${path}` }),
          severityHint: 3,
        },
      ]);
    this.emit([
      {
        type: 'gate.requested',
        gate: {
          id: gateId,
          action,
          route:
            this.acting?.route ??
            routeOf(this.state.routes.find((r) => r.status === 'testing')?.path ?? '/'),
          // SPEC-phase4 §9.2: a phone's tap is held, not a request.
          heldRequest: held.method === 'TAP' ? copy.gate.tapOnly : `${held.method} ${path}`,
          testing: 'H3 user control and H5 error prevention',
        },
      },
      { type: 'waiting.changed', waitingFor: 'gate' },
    ]);
    this.setActivity('waiting-on-user');
  }

  /** The gate modal's answer: send or fail the held request, then carry on (§13). */
  respondGate(gateId: string, decision: 'deny' | 'other' | 'allow'): void {
    const p = this.payGate;
    if (p && p.gateId === gateId) {
      const asked = this.state.gate;
      if (decision !== 'allow' && asked) this.refused.add(`${asked.route}|${asked.action}`);
      this.emit([{ type: 'gate.decided', gateId, decision }]);
      this.say(
        decision === 'allow'
          ? copy.fitts.gateAllowed
          : decision === 'other'
            ? copy.fitts.gateOther
            : copy.fitts.gateDenied,
      );
      this.resumeFromCard();
      p.resolve(decision === 'allow');
      return;
    }
    const h = this.heldReq;
    if (!h || h.gateId !== gateId) return;
    this.heldReq = undefined;
    const asked = this.state.gate;
    if (decision !== 'allow' && asked) this.refused.add(`${asked.route}|${asked.action}`);
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
    const pages = [...this.pages.values()].slice(0, THEME_ROUTES);
    const shots = pages.flatMap((p) => (p.evidence.shot ? [p.evidence.shot.jpegBase64] : []));
    // A9: on Android the question is whether the theme carries the app's own brand. A misfit is
    // one finding (the Brand check's), never a redesign card.
    if (androidApp(this.lastSnap?.url)) {
      const brand = this.deps.brandFit;
      if (!brand || shots.length === 0) return;
      const v = await brand(
        {
          brief: this.state.brief,
          shots,
          tokens: (this.deps.appModel?.tokens ?? []).flatMap((t) => t.names).slice(0, 40),
        },
        this.abort.signal,
      ).catch(() => null);
      if (!v || v.fits || this.finished) return;
      const route = pages[0]?.evidence.route ?? '/';
      this.brandReviews.push({
        route,
        persona: BRAND_PERSONA,
        drafts: [
          brandDraft(
            v,
            pages.map((p) => `${p.evidence.route}#snapshot`),
          ),
        ],
      });
      return;
    }
    const ask = this.deps.themeFit;
    if (!ask) return;
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
    this.deps.memory?.taste('likes', `The look “${picked.name}”: ${picked.notes}`);
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
    this.deps.memory?.taste('dislikes', feedback);
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
    // Autonomous: the look is on the branch; "Send it back" asks what to change.
    if (item.autonomous) {
      if (answer !== 'back') return;
      this.emit([{ type: 'chat.item.updated', item: { ...item, answer } }]);
      this.sendingBack = true;
      this.say('What should I change? Tell me and I’ll change it on the branch.');
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
  /**
   * The device pass (SPEC-phase4 §6.3): the matrix is chosen from the site's own breakpoints
   * and media rules (plus the App Model's), then every explored page gets the cheap probes in
   * every cell. Screenshots only for the phone cell (the reviewers' second view of each page).
   */
  private async devicePass(): Promise<void> {
    const site = this.deps.site;
    // Inside the owner's focus, when there is one (Allen, Nov 4).
    const routes = [...this.pages.keys()]
      .filter((r) => !FILE_ROUTE.test(r) && this.coverage.inFocus(r))
      .slice(0, MAX_CELL_PAGES);
    if (!site.cell || routes.length === 0) return;
    const media = (await site.breakpoints?.().catch(() => [])) ?? [];
    const text = media.join('\n');
    const model = this.deps.appModel;
    const cells = chooseCells({
      breakpoints: mergeBreakpoints(widthsFromCss(text), model?.breakpoints ?? []),
      dark: /prefers-color-scheme/.test(text) || Boolean(model?.media.darkMode),
      reducedMotion: /prefers-reduced-motion/.test(text) || Boolean(model?.media.reducedMotion),
    });
    this.cells = cells;
    this.cellsRun = 0;
    await site.registerCells?.(cells).catch(() => undefined);
    this.emit([{ type: 'run.patch', patch: { cells } }]);
    this.syncCoverage();
    let original: string | null | undefined;
    try {
      for (const cell of cells) {
        if (this.finished) break;
        let previous: string | null;
        try {
          previous = await site.cell(cell);
        } catch {
          continue;
        }
        original ??= previous;
        this.cellNow = cell.id;
        for (const route of routes) {
          if (this.finished) break;
          this.emit([
            {
              type: 'now.changed',
              nowText: format(copy.fitts.checkingCell, { route, cell: cell.label }),
            },
          ]);
          await site.navigate(route).catch(() => undefined);
          await new Promise((r) => setTimeout(r, 350));
          await this.probes.onCell(route, cell);
          if (cell.id === 'phone') {
            const shot = await site.screenshot().catch(() => null);
            const page = this.pages.get(route);
            if (shot && page)
              page.evidence.phoneShot = { jpegBase64: shot.jpegBase64, label: cell.label };
          }
        }
        this.cellsRun += 1;
        this.syncCoverage();
      }
    } finally {
      this.cellNow = undefined;
      if (original !== undefined) await site.device?.(original).catch(() => undefined);
    }
  }

  /** The journeys for the state and the decider (SPEC-phase4 §6.1). */
  private journeyList(): NonNullable<RunState['journeys']> & NonNullable<Situation['journeys']> {
    const all = this.deps.appModel?.journeys ?? [];
    return [...this.journeyStatus].flatMap(([id, s]) => {
      const j = all.find((x) => x.id === id);
      return j
        ? [
            {
              id,
              name: j.name,
              priority: j.priority,
              status: s.status,
              ...(s.reason ? { reason: s.reason } : {}),
              ...(s.steps !== undefined ? { steps: s.steps } : {}),
            },
          ]
        : [];
    });
  }

  private setJourney(
    id: string,
    patch: {
      status: 'planned' | 'running' | 'done' | 'failed' | 'blocked';
      reason?: string;
      steps?: number;
    },
  ): void {
    this.journeyStatus.set(id, patch);
    this.emit([{ type: 'run.patch', patch: { journeys: this.journeyList() } }]);
    this.syncCoverage();
  }

  /**
   * One journey (SPEC-phase4 §6.1): the decider's pick, else the next planned by priority. Each
   * step goes through `perform`, so the gate, the modes and the probes apply as in the crawl,
   * and the pages it visits are observed and remembered like the crawl's. A journey that
   * doesn't get there is evidence for the reviewers, on the page it ended on.
   */
  private async journey(d: Decision): Promise<Outcome> {
    const outcome = (result: Outcome['result'], note?: string): Outcome => ({
      ability: 'journey',
      result,
      ...(note ? { note } : {}),
    });
    const all = this.deps.appModel?.journeys ?? [];
    const { first, later } = journeyOrder(all);
    // With a focus, only journeys that start or pass inside it (Allen, Nov 4).
    const planned = (j: Journey) =>
      this.journeyStatus.get(j.id)?.status === 'planned' &&
      [j.start, ...j.pages].some((r) => !isPattern(r) && this.coverage.inFocus(r));
    const j =
      (d.journeyId ? all.find((x) => x.id === d.journeyId && planned(x)) : undefined) ??
      [...first, ...later].find(planned);
    if (!j)
      return outcome(
        'nothing',
        this.coverage.focused()
          ? 'no journey left inside the owner’s focus'
          : 'no journey left to try',
      );
    this.setJourney(j.id, { status: 'running' });
    this.emit([
      { type: 'now.changed', nowText: format(copy.fitts.tryingJourney, { name: j.name }) },
    ]);
    const site = this.deps.site;
    const spark = this.deps.journeyBrain?.(j);
    const brain = spark ? new FallbackJourneyBrain(spark) : new PlanJourneyBrain();
    this.journeyNow = j.id;
    const snap0 = await site.snapshot().catch(() => undefined);
    if (snap0 && !isPattern(j.start) && routeOf(snap0.path) !== routeOf(j.start))
      await this.perform(
        {
          kind: 'navigate',
          path: j.start,
          why: format(copy.fitts.tryingJourney, { name: j.name }),
        },
        snap0.path,
      );
    this.probes.walking = true;
    const result = await runJourney(this.walkDeps(brain), j).finally(
      () => (this.probes.walking = false),
    );
    this.journeyNow = undefined;
    // Paused or stopped mid-way: not the journey's fault; it's tried again later.
    if (result.status === 'blocked' && result.reason === 'the run stopped' && !this.finished) {
      this.setJourney(j.id, { status: 'planned' });
      return outcome('progress', 'interrupted');
    }
    this.setJourney(j.id, {
      status: result.status,
      ...(result.reason ? { reason: result.reason } : {}),
      steps: result.steps,
    });
    this.say(
      result.status === 'done'
        ? format(copy.fitts.journeyDone, { name: j.name, n: result.steps })
        : format(copy.fitts.journeyFailed, { name: j.name, reason: result.reason ?? '' }),
    );
    if (result.status !== 'done')
      this.notice([
        {
          id: this.nextObsId(),
          step: this.state.step,
          route: result.route,
          kind: 'state',
          text: format(copy.noticed.journeyFailed, { name: j.name, reason: result.reason ?? '' }),
          severityHint: 2,
        },
      ]);
    if (result.status !== 'done')
      this.pages
        .get(result.route)
        ?.evidence.trace.push(
          `journey “${j.name}” ${result.status} after ${result.steps} actions: ${result.reason ?? ''} (${result.trace.slice(-4).join('; ')})`,
        );
    if (this.inbox.length > 0) return outcome('progress', 'the owner spoke');
    return outcome(result.status === 'done' ? 'done' : 'progress', `${j.name}: ${result.status}`);
  }

  /** What a journey or a task acts through: the crawl's own perform, probes and memory, and the pay gate. */
  private walkDeps(brain: JourneyBrain): JourneyDeps {
    const site = this.deps.site;
    return {
      brain,
      snapshot: async () => {
        const s = await site.snapshot();
        this.coverage.observe(s);
        this.syncCoverage();
        await this.probes.onPage(s);
        await this.remember(s);
        this.lastSnap = s;
        return s;
      },
      screenshot: async () => (await site.screenshot().catch(() => undefined))?.jpegBase64,
      perform: async (action, from) => {
        const allowed =
          action.kind === 'click' &&
          this.allowedTap?.name === action.name &&
          this.allowedTap.route === routeOf(from);
        try {
          await this.perform(action, from);
        } finally {
          if (allowed) this.allowedTap = undefined;
        }
        this.deliverQueued();
        return (await site.snapshot().catch(() => ({ path: from }))).path;
      },
      back: async () => (await site.back()).path,
      stopped: () => this.finished || this.blocked(),
      forms: (route) => this.deps.appModel?.pages.find((p) => p.route === route)?.forms ?? [],
      confirm: (name, route) => this.confirmPays(name, route),
      signal: this.abort.signal,
    };
  }

  /**
   * The gate card for a control that pays or places an order ("Place pickup order?"): the
   * owner's yes taps it once, their no ends there. It waits as long as they take; only Stop or
   * taking the wheel closes it unanswered (Allen, Nov 4: the order the owner allowed was
   * never placed, and nothing said why).
   */
  private confirmPays(name: string, route: string): Promise<boolean> {
    if (this.finished) return Promise.resolve(false);
    if (this.refused.has(`${route}|${name}`)) return Promise.resolve(false);
    // Dangerous mode on localhost taps what it finds, as it does at the network gate.
    if (this.state.mode === 'dangerous' && isLocal(this.deps.origin)) {
      this.say(format(copy.fitts.gateSkippedDangerous, { action: name }));
      this.allowedTap = { name, route };
      return Promise.resolve(true);
    }
    const gateId = `gate-pays-${this.id()}`;
    return new Promise<boolean>((resolve) => {
      this.payGate = {
        gateId,
        resolve: (yes) => {
          this.payGate = undefined;
          if (yes) this.allowedTap = { name, route };
          resolve(yes);
        },
      };
      this.emit([
        {
          type: 'gate.requested',
          gate: {
            id: gateId,
            action: name,
            route,
            heldRequest: copy.gate.pays.holding,
            testing: copy.gate.pays.testing,
            kind: 'pays',
          },
        },
        { type: 'waiting.changed', waitingFor: 'gate' },
        { type: 'now.changed', nowText: format(copy.gate.pays.title, { action: name }) },
      ]);
      this.setActivity('waiting-on-user');
    });
  }

  /**
   * A task the owner asked for ("fill in name, phone and a pickup time and place the order"),
   * done with steps on the page Fitts is on, the way a journey is: the same perform, probes
   * and pay gate. Never a search for a planned journey (Allen, Nov 4).
   */
  private async task(d: Decision): Promise<Outcome> {
    const outcome = (result: Outcome['result'], note?: string): Outcome => ({
      ability: 'task',
      result,
      ...(note ? { note } : {}),
    });
    const goal = (d.goal ?? this.heard.at(-1) ?? '')
      .replace(/\s*\[pointing at ref[^\]]*\]\s*$/, '')
      .trim();
    if (!goal) return outcome('refused', 'nothing asked: the owner said nothing to do');
    const snap = await this.deps.site.snapshot().catch(() => undefined);
    const start = routeOf(snap?.path ?? '/');
    this.tasks += 1;
    const j: Journey = {
      id: `task-${this.tasks}`,
      name: goal.slice(0, 80),
      goal,
      start,
      steps: [goal],
      pages: [start],
      priority: 1,
      // "Check out" opens a form here; the control that pays still goes to the gate.
      needs: ['payment'],
      source: 'owner',
    };
    this.emit([{ type: 'now.changed', nowText: format(copy.fitts.doingTask, { goal: j.name }) }]);
    const spark = this.deps.journeyBrain?.(j);
    const brain = spark ? new FallbackJourneyBrain(spark) : new PlanJourneyBrain();
    this.journeyNow = j.id;
    this.probes.walking = true;
    const result = await runJourney(this.walkDeps(brain), j).finally(
      () => (this.probes.walking = false),
    );
    this.journeyNow = undefined;
    if (result.status === 'blocked' && result.reason === 'the run stopped' && !this.finished)
      return outcome('progress', 'interrupted');
    this.emit([{ type: 'now.changed' }]);
    this.say(
      result.status === 'done'
        ? format(copy.fitts.journeyDone, { name: j.name, n: result.steps })
        : format(copy.fitts.journeyFailed, { name: j.name, reason: result.reason ?? '' }),
    );
    if (result.status !== 'done')
      this.pages
        .get(result.route)
        ?.evidence.trace.push(
          `the owner's task “${j.name}” ${result.status} after ${result.steps} actions: ${result.reason ?? ''} (${result.trace.slice(-4).join('; ')})`,
        );
    return outcome(result.status === 'done' ? 'done' : 'progress', `${j.name}: ${result.status}`);
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
        ready: () => this.untilModels(),
        restingActivity: () => (this.finished ? 'idle' : 'acting'),
        review: (changeId, adjust) => this.reviewRedesign(changeId, adjust),
        settled: (change) => this.changeSettled(change),
        appModel: () => this.deps.appModel,
        cell: (id) => this.cellFor(id),
        traceReplay: (id) => this.traceReplays.get(id),
        recheck: (id) => this.recheckOf(id),
        askItem: (text) => this.askItem(text),
        ...(this.deps.reviewCheck
          ? {
              checkByReview: (f: Finding, after: string) => {
                const before = this.pages.get(f.route)?.evidence.shot?.jpegBase64;
                return (
                  this.deps.reviewCheck?.({
                    finding: {
                      title: f.title,
                      finding: f.finding,
                      fix: f.fix,
                      route: f.route,
                      ...(f.repro?.expected ? { expected: f.repro.expected } : {}),
                    },
                    ...(before ? { before } : {}),
                    after,
                  }) ?? Promise.resolve({ fixed: false, why: '' })
                );
              },
            }
          : {}),
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
      // What the site says its hours are, from any page, so a page offering times can be checked.
      const siteHours = [...new Set(pages.flatMap((p) => p.evidence.snapshot.hours ?? []))].slice(
        0,
        10,
      );
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
                  ...(siteHours.length ? { siteHours } : {}),
                  probes: this.probes.results.filter((r) => r.route === p.evidence.route),
                  observations: this.observations.filter((o) => o.route === p.evidence.route),
                  states: chooseStates(
                    [
                      { key: 'first', route: p.evidence.route, label: 'first', stepIndex: 0 },
                      ...(p.evidence.states ?? []).map((s) => ({ ...s, route: p.evidence.route })),
                    ],
                    1 + 5,
                  )
                    .slice(1)
                    .map((s) => (p.evidence.states ?? []).find((x) => x.key === s.key))
                    .filter((s): s is NonNullable<typeof s> => Boolean(s)),
                  records: (this.state.actions ?? []).filter(
                    (a) => a.from === p.evidence.route || a.to === p.evidence.route,
                  ),
                },
                this.state.brief,
                this.abort.signal,
                memoryForReviewers(this.deps.memory?.get()),
              ),
            ),
          );
          reviews.push(...done.flat());
        } catch {
          // Aborted (⌘. or stop): carry on with what the panel has said so far.
        }
      }
    }
    for (const r of reviews.filter((x) => x.unusable))
      this.say(format(copy.fitts.reviewerUnreadable, { persona: r.persona, route: r.route }));
    // The judge's looks finish first: its votes count like one reviewer (§6B.5). So does the
    // brand check on Android (A9).
    await Promise.all(this.judging);
    await this.themeCheck;
    reviews.push(...this.judgeReviews, ...this.brandReviews);
    const { findings: aggregated, checks } = aggregateWithChecks({
      runId: this.state.runId,
      probes: this.probes.results,
      reviews,
      cells: this.cells,
      stepOf: (route) => {
        const p = this.pages.get(route);
        return { stepIndex: p?.stepIndex ?? 0, atMs: p?.atMs ?? 0 };
      },
    });
    this.checks = checks;
    // A finding resting on a judged moment carries it, for See it yourself's strip.
    const findings = aggregated.map((f) => {
      const id = f.evidenceIds?.find((e) => this.moments.has(e));
      const moment = id ? this.moments.get(id) : undefined;
      return moment ? { ...f, moment } : f;
    });
    // The owner's rules first (§4.3): what they said is fine goes to the owner-ok lane.
    const ruled = applyRules(findings, this.deps.memory?.get(), (f) => checks.get(f.id)?.probe);
    const withReplay = await this.withSources(ruled.map((f) => this.withReplay(f)));
    this.post(withReplay);
    this.linkObservations(withReplay);
    const shown = withReplay.filter((f) => (f.lane ?? 'shown') === 'shown');
    void this.evidence(shown).then(() => this.media(shown));
    void this.reproJob(shown);
  }

  /**
   * Every shown finding gets a source (SPEC-phase4 §2.2): its element's component chain from
   * the page (the plugin's stamps, else the page's own debug info), then a text search of the
   * project for what the element says. Page data is a hint; the fixer re-reads the file.
   */
  private async withSources(findings: Finding[]): Promise<Finding[]> {
    const out: Finding[] = [];
    for (const f of findings) {
      if (this.finished) return [...out, ...findings.slice(out.length)];
      out.push((f.lane ?? 'shown') === 'shown' ? await this.withSource(f) : f);
    }
    return out;
  }

  private async withSource(f: Finding): Promise<Finding> {
    let next = f;
    if (f.elementRef) {
      const chain = await this.sourceChain(f.route, f.elementRef);
      if (chain.length) next = { ...next, sourceChain: chain };
      if (!next.source) {
        const frame = chain.find((x) => x.src);
        const parsed = frame?.src ? parseSrc(frame.src) : null;
        if (parsed)
          next = {
            ...next,
            source: {
              ...parsed,
              confidence: frame?.kind === 'debug' ? 'source-map' : 'plugin',
            },
          };
      }
    }
    if (!next.source && !isLiveOrigin(this.deps.origin)) {
      const hit = await this.searchSource(f);
      if (hit) next = { ...next, source: { ...hit, confidence: 'search' } };
    }
    // Last: the App Model's route → component file (§3), the lowest rung of the ladder.
    if (!next.source) {
      const page = this.deps.appModel?.pages.find((p) => p.route === f.route);
      if (page?.file) next = { ...next, source: { file: page.file, line: 1, confidence: 'model' } };
    }
    return next;
  }

  /**
   * The chain for an element on a route: what the page's first visit recorded, else a live
   * read when the site is on that page right now (never a navigation: the review shouldn't
   * move the site around).
   */
  private async sourceChain(route: string, ref: string): Promise<SourceFrame[]> {
    const cached =
      this.pages.get(route)?.chains?.[ref] ??
      [...this.pages.values()].map((p) => p.chains?.[ref]).find((c) => c?.length);
    if (cached?.length) return cached;
    const site = this.deps.site;
    if (!site.sourceOf) return [];
    try {
      const snap = await site.snapshot();
      if (routeOf(snap.path) !== route) return [];
      return await site.sourceOf(ref);
    } catch {
      return [];
    }
  }

  /**
   * A text search for the element's own words: its accessible name from the page, then the
   * quoted text in the finding's evidence. The first hit in a source file wins.
   */
  private async searchSource(f: Finding): Promise<{ file: string; line: number } | null> {
    // The element's name from whichever page's snapshot has it (a finding on several pages
    // keeps the first page as its route).
    const node = f.elementRef
      ? [this.pages.get(f.route), ...this.pages.values()]
          .flatMap((p) => p?.evidence.snapshot.nodes ?? [])
          .find((n) => n.ref === f.elementRef)
      : undefined;
    const quoted = f.evidence.flatMap((e) =>
      [...e.matchAll(/[“"]([^”"]{3,80})[”"]/g)].map((m) => m[1] ?? ''),
    );
    // A finding about the page as a whole (no element): where its route is named in the code
    // (the router entry), which is the closest a search gets to "this page".
    const routeNeedle = !f.elementRef && f.route.length > 1 ? [`'${f.route}'`, `"${f.route}"`] : [];
    // SPEC-phase4 §9.4: an Android element is its testID, written as is or built from a stem
    // (testID={`cart-remove-${key}`}).
    const ref = f.elementRef ?? '';
    const testIdNeedles =
      androidApp(this.lastSnap?.url) && ref && !/^a\d+$/.test(ref)
        ? [`testID="${ref}"`, ...(ref.includes('-') ? [ref.replace(/-[^-]+$/, '-')] : [])]
        : [];
    const needles = [
      ...new Set(
        [...testIdNeedles, node?.name ?? '', ...quoted, ...routeNeedle]
          .map((s) => s.trim())
          .filter((s) => s.length >= 3),
      ),
    ];
    for (const text of needles.slice(0, 4)) {
      let hits: unknown;
      try {
        hits = await this.deps.site.fix({ fn: 'grep', text });
      } catch {
        return null;
      }
      if (!Array.isArray(hits)) return null;
      const hit = (hits as { path: string; line: number }[]).find(
        (h) => typeof h?.path === 'string' && SOURCE_FILE.test(h.path),
      );
      if (hit) return { file: hit.path, line: hit.line };
    }
    return null;
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
      if (f.lane === 'suggestion' || f.lane === 'owner-ok') continue;
      events.push({ type: 'chat.item', item: { id: this.id(), type: 'finding', findingId: f.id } });
      if (f.elementRef) problems.push({ ref: f.elementRef, pin: problems.length + 1 });
    }
    events.push({ type: 'overlay.set', overlays: { ...this.state.overlays, problems } });
    this.emit(events);
  }

  private syncCoverage(): void {
    const lifted = this.coverage.takeLifted();
    if (lifted) this.say(format(copy.fitts.focusCovered, { pages: lifted.join(', ') }));
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
    // SPEC-phase4 §6.2: coverage against the code, when there is a model to measure against.
    if (this.deps.appModel) {
      const coverage = this.runCoverage();
      const key = JSON.stringify(coverage);
      if (key !== this.lastCoverage) {
        this.lastCoverage = key;
        events.push({ type: 'run.patch', patch: { coverage } });
      }
    }
    if (events.length) this.emit(events);
  }

  /** Pages, journeys, controls and cells against the App Model, with why a page wasn't reached. */
  private runCoverage(): RunCoverage {
    const model = this.deps.appModel;
    const code = this.coverage.codeRoutes();
    const unreached: RunCoverage['unreached'] = [];
    for (const r of code) {
      if (r.seen) continue;
      const page = model?.pages.find((p) => p.route === r.path);
      const why: RunCoverage['unreached'][number]['why'] = r.skipped
        ? 'skipped'
        : page?.gate === 'login' || page?.gate === 'role'
          ? 'login'
          : page?.gate === 'data' || page?.gate === 'flag'
            ? 'data'
            : r.label === 'unreachable'
              ? 'error'
              : r.linked
                ? 'error'
                : 'unlinked';
      unreached.push({ route: r.path, why });
    }
    const seenPatterns = new Set([...this.pages.keys()].map((k) => patternOf(k)));
    // A catch-all ("/*") is what the router shows for any other URL: never a page to reach.
    const dynamic = (model?.pages ?? []).filter(
      (p) => (p.dynamic || p.route.includes(':')) && !isCatchAll(p.route),
    );
    let dynamicReached = 0;
    for (const p of dynamic) {
      if (seenPatterns.has(p.route)) dynamicReached += 1;
      else unreached.push({ route: p.route, why: 'data' });
    }
    const js = [...this.journeyStatus.values()];
    const count = (s: string) => js.filter((j) => j.status === s).length;
    return {
      pages: {
        known: code.length + dynamic.length,
        reached: code.filter((r) => r.seen).length + dynamicReached,
      },
      journeys: {
        planned: js.length,
        done: count('done'),
        failed: count('failed'),
        blocked: count('blocked'),
      },
      controls: this.coverage.controlsTried(),
      cells: { planned: this.cells.length, run: this.cellsRun },
      unreached,
    };
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
    // The owner already said no to this control on this page: not again.
    if (action.kind === 'click' && this.refused.has(`${routeOf(from)}|${action.name}`)) {
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
    if (action.kind === 'click') this.lastAction = `Tapped “${action.name}”`;
    else if (action.kind === 'type') this.lastAction = `Typed into “${action.name}”`;
    else if (action.kind === 'navigate') this.lastAction = `Opened ${action.path ?? from}`;
    let outcome: { path: string; navigated: boolean; trace?: OpTrace } | undefined;
    try {
      if (action.kind === 'navigate') {
        if (this.coverage.routeDone(from)) this.coverage.setStatus(from, 'done');
        await this.deps.site.navigate(action.path);
        this.logAction(format(copy.fitts.did.opened, { path: action.path }));
        this.history.push(`opened ${action.path}`);
        this.pages.get(routeOf(from))?.evidence.trace.push(`opened ${action.path}`);
      } else {
        const use = () =>
          action.kind === 'click'
            ? this.deps.site.click(action.ref, DESTRUCTIVE.test(action.name))
            : this.deps.site.type(action.ref, action.text);
        // A list that loads late: the control isn't there yet. One more try after a moment,
        // then it counts as unusable (below), never as a tap that did nothing.
        const result = await use().catch(async (e: unknown) => {
          if (!/No (element|field)/.test(e instanceof Error ? e.message : String(e))) throw e;
          await new Promise((r) => setTimeout(r, 2000));
          return use();
        });
        outcome = result;
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
    this.trail.push(this.trailStep(step, action, from, logged ?? label, outcome));
    this.record(step, action, from, outcome);
    this.emit([{ type: 'step.finished', step }]);
    this.syncCoverage();
  }

  /**
   * SPEC-phase4 §6A: one record per action from what main measured, and the notes its
   * measurements earn; the steps line gets its timing chip and its noticed lines.
   */
  private record(
    step: number,
    action: Exclude<Action, { kind: 'done' }>,
    from: string,
    outcome: { path: string; navigated: boolean; trace?: OpTrace } | undefined,
  ): void {
    const node =
      action.kind === 'navigate'
        ? undefined
        : this.lastSnap?.nodes.find((n) => n.ref === action.ref);
    const record = buildRecord({
      step,
      at: this.state.elapsedMs,
      kind: action.kind,
      ...(action.kind !== 'navigate'
        ? {
            target: {
              name: node?.name ?? action.name,
              role: node?.role ?? 'element',
              ref: action.ref,
            },
          }
        : {}),
      from: routeOf(from),
      to: routeOf(outcome?.path ?? (action.kind === 'navigate' ? action.path : from)),
      trace: outcome?.trace,
      ...(this.journeyNow ? { journeyId: this.journeyNow } : {}),
    });
    // A tap or typing that never happened (the control wasn't on the page yet, so the site
    // couldn't use it) says nothing about the page: no "nothing changed on screen" for a list
    // that hadn't loaded (bench:chat, Nov 2: Grandma on /contacts, the search results).
    const performed = action.kind === 'navigate' || outcome !== undefined;
    const notes = performed
      ? noticeAction(record, outcome?.trace, this.nextObsId, this.cellNow)
      : [];
    record.observations = notes.map((n) => n.id);
    this.emit([{ type: 'action.recorded', record }]);
    this.notice(notes);
    const ms = responseMs(record);
    const slow = notes.some((n) => n.kind === 'slow' || n.kind === 'no-feedback');
    this.decorateStep(ms, slow, record.observations, record.step);
    // The brain's history is the log's compact line, not a label (§6A.4).
    const last = this.history.length - 1;
    if (last >= 0) this.history[last] = recordLine(record, notes);
  }

  /** Adds notes to the run (state, chat) and to the current steps line. */
  private notice(notes: Observation[]): void {
    if (notes.length === 0) return;
    this.observations.push(...notes);
    this.emit(notes.map((observation) => ({ type: 'observation.added' as const, observation })));
    const last = this.state.chat.at(-1);
    if (this.stepsItem && last?.id === this.stepsItem.id && last.type === 'steps') {
      const steps = [...last.steps];
      const i = steps.findLastIndex((s) => !s.detail);
      const entry = steps[i];
      if (entry) {
        const noticed = [...(entry.noticed ?? []), ...notes.map((n) => n.id)];
        steps[i] = { ...entry, noticed: [...new Set(noticed)] };
        this.stepsItem = { id: last.id, steps };
        this.emit([{ type: 'chat.item.updated', item: { ...last, steps } }]);
      }
    }
  }

  /** The current steps line gets its timing and its slow flag (§6A.3). */
  private decorateStep(ms: number | null, slow: boolean, noticed: string[], step?: number): void {
    const last = this.state.chat.at(-1);
    if (!this.stepsItem || last?.id !== this.stepsItem.id || last.type !== 'steps') return;
    const steps = [...last.steps];
    const i = steps.findLastIndex((s) => !s.detail);
    const entry = steps[i];
    if (!entry) return;
    steps[i] = {
      ...entry,
      ms,
      ...(step !== undefined ? { step } : {}),
      ...(slow ? { slow } : {}),
      noticed: [...new Set([...(entry.noticed ?? []), ...noticed])],
    };
    this.stepsItem = { id: last.id, steps };
    this.emit([{ type: 'chat.item.updated', item: { ...last, steps } }]);
  }

  /** After the review: the notes a finding rests on say so, and the steps lines link to it. */
  private linkObservations(findings: Finding[]): void {
    const linked = new Map<string, string>();
    for (const f of findings) {
      const ids = new Set<string>([...(f.evidenceIds ?? [])]);
      for (const o of observationsFor(f, this.observations, ids)) {
        if (o.findingId || linked.has(o.id)) continue;
        linked.set(o.id, f.id);
        o.findingId = f.id;
        this.emit([{ type: 'observation.linked', id: o.id, findingId: f.id }]);
      }
    }
    if (linked.size === 0) return;
    for (const item of this.state.chat) {
      if (item.type !== 'steps') continue;
      let changed = false;
      const steps = item.steps.map((s) => {
        const ids = (s.noticed ?? []).flatMap((id) =>
          linked.has(id) ? [linked.get(id) ?? ''] : [],
        );
        if (ids.length === 0) return s;
        changed = true;
        return { ...s, findingIds: [...new Set([...(s.findingIds ?? []), ...ids])] };
      });
      if (changed) this.emit([{ type: 'chat.item.updated', item: { ...item, steps } }]);
    }
  }

  /** "Show me" on a noticed line: the page, the cell, and the element outlined (§6A.3). */
  private async showObservation(o: Observation): Promise<void> {
    if (this.state.activity === 'acting') this.setActivity('paused');
    const cell = o.cell ? this.cells.find((c) => c.id === o.cell) : undefined;
    if (cell) await this.deps.site.cell?.(cell).catch(() => null);
    else if (o.cell) await this.deps.site.device?.(o.cell).catch(() => null);
    try {
      await this.deps.site.navigate(o.route);
      if (o.ref) await this.deps.site.reveal?.(o.ref);
    } catch {
      this.say(format(copy.fitts.showFindingFailed, { route: o.route }));
      return;
    }
    this.emit([
      {
        type: 'overlay.set',
        overlays: {
          problems: this.state.overlays.problems,
          ...(o.ref
            ? { attention: { ref: o.ref, label: o.text.replace(/\*\*/g, '').slice(0, 60) } }
            : {}),
        },
      },
    ]);
  }

  /** One trail entry (SPEC-phase4 §5.1): what was touched, by role and name, and where it led. */
  private trailStep(
    step: number,
    action: Exclude<Action, { kind: 'done' }>,
    from: string,
    label: string,
    outcome: { path: string; navigated: boolean; trace?: OpTrace } | undefined,
  ): TrailStep {
    if (action.kind === 'navigate')
      return { step, route: routeOf(from), kind: 'navigate', to: action.path, label };
    const node = this.lastSnap?.nodes.find((n) => n.ref === action.ref);
    const testId = /^e\d+$/.test(action.ref) ? undefined : action.ref;
    const ms = outcome?.trace?.feedback?.firstChangeMs ?? null;
    return {
      step,
      route: routeOf(from),
      ref: action.ref,
      kind: action.kind,
      label,
      target: { role: node?.role ?? 'button', name: action.name, ...(testId ? { testId } : {}) },
      ...(action.kind === 'type' ? { text: action.text } : {}),
      ...(outcome?.navigated && routeOf(outcome.path) !== routeOf(from)
        ? { to: outcome.path }
        : {}),
      ...(ms !== null ? { ms } : {}),
    };
  }

  /**
   * Repros (SPEC-phase4 §5.2), in the background after the review: for the top findings by
   * severity, the pruned steps, expected/actual, the environment and the test; then the hidden
   * replayer re-runs the steps and the oracle, and the finding says "replayed" when it saw
   * the problem again.
   */
  private async reproJob(findings: Finding[], max = 20): Promise<void> {
    const ranked = [...findings].sort((a, b) => b.severity - a.severity).slice(0, max);
    for (const f of ranked) {
      if (this.finished) return;
      try {
        await this.repro(f);
      } catch {
        // Best effort: the finding keeps "How I found it".
      }
    }
  }

  private async repro(f: Finding): Promise<void> {
    const check = this.checks.get(f.id);
    const item = check
      ? (this.probes.results
          .filter((r) => r.probe === check.probe && !r.pass)
          .flatMap((r) => r.items)
          .find(
            (i) =>
              titleOf(check.probe, i) === check.title && (!f.elementRef || i.ref === f.elementRef),
          ) ??
        this.probes.results
          .filter((r) => r.probe === check.probe && !r.pass)
          .flatMap((r) => r.items)
          .find((i) => titleOf(check.probe, i) === check.title))
      : undefined;
    const device = f.seenOn ? DEVICES.find((d) => d.id === f.seenOn) : undefined;
    const cell = f.seenOn
      ? (this.cells.find((c) => c.id === f.seenOn) ??
        (device ? { ...device, touch: device.mobile } : undefined))
      : undefined;
    const page = this.pages.get(f.route);
    const trail = this.trail.filter((t) => t.step <= (f.stepIndex || Number.MAX_SAFE_INTEGER));
    const input = {
      finding: f,
      trail,
      origin: this.deps.origin,
      ...(cell ? { cell } : {}),
      userAgent: `Chrome/${process.versions['chrome'] ?? ''}`,
      ...(page?.size ? { size: page.size } : {}),
      ...(item ? { item } : {}),
      ...(check ? { probe: check.probe } : {}),
      ...(item?.rule
        ? {
            axe: {
              id: item.rule.id,
              tags: item.rule.tags,
              ...(item.rule.helpUrl ? { helpUrl: item.rule.helpUrl } : {}),
            },
          }
        : {}),
      ...(f.reviewerRepro ? { draft: f.reviewerRepro } : {}),
      ...(this.deps.appModel ? { model: this.deps.appModel } : {}),
    };
    let repro = buildRepro(input);
    const pruned = pruneTrail(trail, f, this.deps.appModel);
    const replayer = this.deps.site.replay?.bind(this.deps.site);
    if (replayer && !f.owner) {
      const start = { path: f.route, device: cell?.id ?? null };
      const { confirmed, steps } = await confirmRepro(
        (ask) => replayer(ask),
        oracleFor(f, check),
        f,
        repro,
        pruned,
        trail,
        start,
        { ready: () => this.untilModels(), stopped: () => this.finished },
      );
      if (steps !== pruned) repro = buildRepro({ ...input, steps });
      repro = { ...repro, confirmed };
      this.reproSteps.set(f.id, replaySteps(steps));
      // SPEC-phase4 §7.5: a trace finding seen again can have its fix checked the same way.
      const oracle = oracleFor(f, check);
      if (confirmed === 'replayed' && oracle.kind === 'trace')
        this.traceReplays.set(f.id, traceReplay(oracle, f, start, steps));
      // SPEC-phase4 §9.3: on Android the repro is a Maestro flow on the app, not a browser test.
      const app = androidApp(this.lastSnap?.url);
      if (app)
        repro = {
          ...repro,
          environment: 'Android emulator · development build',
          maestro: maestroFlow(f, repro, app),
        };
      else repro.playwright = playwrightTest(f, repro, { probe: check?.probe, item, cell });
    }
    const now = this.state.findings.find((x) => x.id === f.id);
    if (now && !this.finished) this.emit([{ type: 'finding.updated', finding: { ...now, repro } }]);
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
    // What was checked, for a run that found nothing (the proposal says so; §4.1).
    const { done } = this.coverage.controlsTried();
    const pages = this.coverage.stateRoutes().length;
    if (this.state.findings.filter((f) => (f.lane ?? 'shown') === 'shown').length === 0)
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
  }

  /**
   * FINALIZE (§9.3): the run's one PR with every verified change, then Done. A run the owner
   * stopped pushes nothing: the branch keeps what passed. Once, whichever path ends the run.
   */
  finish(opts: { stop?: boolean } = {}): void {
    const waiters = this.modelsWaiters;
    this.modelsWaiters = [];
    for (const w of waiters) w();
    if (this.finished || this.finishing) return;
    this.finishing = true;
    void (async () => {
      if (!opts.stop) {
        try {
          await this.pipeline?.finalize();
        } catch {
          // finalize says what went wrong; Done doesn't wait on the PR.
        }
      }
      this.end();
    })();
  }

  /** Done: the run is over, with its closing line. */
  private end(): void {
    if (this.finished) return;
    this.finished = true;
    if (this.clock) clearInterval(this.clock);
    this.abort.abort();
    this.pickWaiter?.(undefined);
    const { done } = this.coverage.controlsTried();
    this.proposalId = undefined;
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
    const pr = changes.find((c) => c.status === 'verified' && c.prNumber !== undefined)?.prNumber;
    const branch = changes.find((c) => c.status === 'verified' && c.branch)?.branch;
    const rolled = changes.filter((c) => c.status === 'rolled-back').length;
    const where =
      pr !== undefined
        ? ` and opened pull request #${pr}`
        : branch
          ? `; everything is on ${branch}, no pull request yet`
          : '';
    this.say(
      changes.length > 0
        ? `All done. I verified ${verified} ${verified === 1 ? 'fix' : 'fixes'}${redesigned ? ' and the redesign' : ''}${where}.` +
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
    this.payGate?.resolve(false);
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
    // Paused for the models: Resume is "Retry now" (§6C); the run carries on when they answer.
    if (this.modelsPaused) {
      this.deps.retryModels?.();
      return;
    }
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
      if (a === 'stop') return this.finish({ stop: true });
      this.say('Okay, carrying on.');
      this.resumeFromCard();
    });
  }

  takeWheel(): void {
    if (this.finished || this.state.activity === 'user-driving') return;
    this.pendingAsk?.(false);
    this.payGate?.resolve(false);
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
    // "Stay on checkout" (Allen, Nov 4): the crawl keeps to those pages, in code, until lifted
    // or covered; the decider still hears the message.
    const pivot = pivotFrom(text, [
      ...this.coverage.stateRoutes().map((r) => ({ route: r.path })),
      ...(this.deps.appModel?.pages ?? []).map((p) => ({ route: p.route, title: p.title })),
    ]);
    if (pivot && 'lift' in pivot) {
      if (this.coverage.focused()) {
        this.coverage.unfocus();
        this.say(copy.fitts.focusLifted);
      }
    } else if (pivot) {
      this.coverage.focus(pivot.focus);
      this.say(format(copy.fitts.focusOn, { pages: pivot.focus.join(', ') }));
    }
    // "Fill in … and place the order": the next thing Fitts does (Allen, Nov 4).
    const task = taskFrom(text);
    if (task) this.asked = task;
    // An open finish proposal closes: the message is what to do next (§4.1).
    const proposal = this.state.chat.find((c) => c.id === this.proposalId);
    if (proposal?.type === 'finish-proposal') this.answerProposal(proposal, 'continue');
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
          noticed: this.observations
            .slice(-8)
            .map((o) => `${o.route}: ${o.text.replace(/\*\*/g, '')}`),
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
    if (
      item?.type === 'state' &&
      item.stateKind === 'api-trouble' &&
      item.answer === undefined &&
      answer === 'retry-now'
    ) {
      this.say(copy.fitts.modelsRetrying);
      this.deps.retryModels?.();
      return;
    }
    if (item?.type === 'review' && item.answer === undefined) {
      this.answerReview(item, answer);
      return;
    }
    if (item?.type === 'finish-proposal') {
      if (item.answer === undefined) this.answerProposal(item, answer);
      return;
    }
    // "Show me" on a noticed line (§6A.3): the item id is the observation's.
    const observation = this.observations.find((o) => o.id === itemId);
    if (observation && answer === 'show') {
      void this.showObservation(observation);
      return;
    }
    // "This matters more/less" on a finding (§4.2): the item id is the finding's.
    const finding = this.state.findings.find((f) => f.id === itemId);
    if (finding && (answer === 'more' || answer === 'less')) {
      this.weigh(finding, answer === 'more' ? 1 : -1);
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
    const cell = f.seenOn ? this.cells.find((c) => c.id === f.seenOn) : undefined;
    const device = cell ?? (f.seenOn ? DEVICES.find((d) => d.id === f.seenOn) : undefined);
    if (cell) await this.deps.site.cell?.(cell).catch(() => null);
    else if (device) await this.deps.site.device?.(device.id).catch(() => null);
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
