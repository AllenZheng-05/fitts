// Messages between main and the agent utility process (process.parentPort).
import type {
  FaultCase,
  Feedback,
  PageProbeName,
  PageProbeResult,
  PagePerf,
  RequestRecord,
  SurpriseEvent,
  TabStop,
} from '@fitts/probes';
import type {
  AppModel,
  AppModelPatch,
  DeviceCell,
  EngineCall,
  MemoryRule,
  ProjectMemory,
  EngineEvents,
  KeyName,
  ProbeItem,
  SiteRect,
  SiteStatus,
  SourceFrame,
} from '@fitts/schema';

/** SPEC-phase4 §5.2: one step the replayer re-runs: by ref when the page still has it, else by role and name. */
export interface ReplayStep {
  kind: 'click' | 'type' | 'back' | 'key' | 'navigate';
  ref?: string;
  target?: { role: string; name: string; testId?: string };
  text?: string;
  path?: string;
}

/** What the replayer runs, and which oracle inputs to read at the end. */
export interface ReplayAsk {
  start: { path: string; device?: string | null };
  steps: ReplayStep[];
  /** Which page probes to run at the end (all when absent), and the sweeps. */
  probes?: PageProbeName[];
  focus?: boolean;
  viewport?: boolean;
  /** The ref of a field whose value to read after the steps (back-mid-flow's oracle). */
  fieldValueOf?: string;
}

export interface ReplayAnswer {
  ok: boolean;
  error?: string;
  path: string;
  results: PageProbeResult[];
  focus: ProbeItem[];
  viewport: ProbeItem[];
  /** One trace per step that acted (navigate and back have none). */
  traces: (OpTrace | null)[];
  /** Steps whose element couldn't be found (by index). */
  missing: number[];
  snapshot?: AxSnapshot;
  value?: string | null;
}

/** One interactive element, as the crawler sees it (an accessibility-style snapshot). */
export interface AxNode {
  ref: string;
  role: string;
  name: string;
  /** Input type, for fields. */
  type?: string;
  value?: string;
  disabled?: boolean;
  /** Same-origin link target. */
  href?: string;
  /** Inside a dialog, form or nav (helps pick primary controls). */
  region?: string;
  /**
   * Which control this is, across re-renders (refs are per element). Controls in repeated
   * cards share one key starting "card:", so a list of 40 team cards is tried once.
   */
  key?: string;
}

export interface AxSnapshot {
  url: string;
  path: string;
  title: string;
  headings: string[];
  nodes: AxNode[];
  /** A password field is on the page (login-wall detection). */
  hasPassword: boolean;
}

/** Browser actions the agent asks main to run on a project's site window (§1: RPC). */
export type SiteOp =
  | { op: 'navigate'; path: string }
  /** `destructive`: the control's name says it deletes or pays; any write it sends is held. */
  | { op: 'click'; ref: string; destructive?: boolean }
  | { op: 'type'; ref: string; text: string }
  | { op: 'press'; key: string }
  | { op: 'back' }
  | { op: 'snapshot' }
  | { op: 'screenshot' }
  | { op: 'health' }
  | { op: 'restart' }
  // Probes (§7)
  | { op: 'probes'; names: PageProbeName[] }
  | { op: 'focus' }
  | { op: 'viewport' }
  /** Look like a device from DEVICES (null: a desktop browser); answers the one it replaced. */
  | { op: 'device'; id: string | null }
  /** SPEC-phase4 §6.3: look like a device cell (size, touch, zoom, text spacing, scheme, motion). */
  | { op: 'cell'; cell: DeviceCell | null }
  /** The run's cells, so main can show and replay them by id later. */
  | { op: 'cells'; cells: DeviceCell[] }
  /** The site's own `@media`/`@container` conditions (same-origin sheets), as text. */
  | { op: 'breakpoints' }
  /** The cheap probes for a cell on the page as it is: overflow, and the cell's own check. */
  | { op: 'cellProbes'; cell: DeviceCell }
  // SPEC-phase4 §6B: detect more.
  /** A Tab sweep (up to 200 stops) and the page's controls (keyboard). */
  | { op: 'keyboard' }
  /** An open dialog's keyboard facts (focus in, Tab stays in, Esc closes, focus returns). */
  | { op: 'dialog' }
  /** What the page shows now, or after loading `path` fresh (refresh, deep link, soft 404). */
  | { op: 'facts'; path?: string }
  /** The surprise detector's events since the last read, with the input times. */
  | { op: 'surprise' }
  /** Load `route` with one of the site's own GETs rewritten (state_pass, local only). */
  | { op: 'fault'; route: string; endpoint: string; fault: FaultCase }
  /** Throttled phone measurements of some pages on a hidden window (perf_pass). */
  | { op: 'perf'; routes: string[] }
  | { op: 'value'; ref: string }
  | { op: 'links'; hrefs: string[] }
  | { op: 'network' }
  /** The gate's answer for a held request (§13): send it, or fail it. */
  | { op: 'release'; id: string; allow: boolean }
  // Media (§10): element boxes, a JPEG as PNG (Muse Image takes PNG), and saving an asset.
  | { op: 'rects'; refs: string[] }
  /** Scrolls an element into view (to show what Fitts is about to touch). */
  | { op: 'reveal'; ref: string }
  /** SPEC-phase4 §2.2: the element's component chain, read from the page's main world. */
  | { op: 'source'; ref: string }
  /** The chains of many elements at once (a page's first visit), one evaluation. */
  | { op: 'sources'; refs: string[] }
  /** SPEC-phase4 §5.2: re-run a finding's steps on the hidden replayer and run its oracle. */
  | { op: 'replay'; ask: ReplayAsk }
  | { op: 'png'; jpegBase64: string }
  | { op: 'saveAsset'; runId: string; name: string; base64: string }
  /** A style board (SPEC-phase3 §2): main embeds its fonts and saves it as an asset. */
  | {
      op: 'board';
      runId: string;
      name: string;
      html: string;
      fonts: { family: string; id: string; weights: number[] }[];
    }
  /** A site the owner admires, screenshotted as design inspiration (never clicked). */
  | { op: 'reference'; url: string }
  /** The fix pipeline's privileged half, in main (§9). */
  | { op: 'fix'; call: FixCall };

/** Calls to main's FixHost (§9): worktrees, files inside them, verification, git and PRs. */
export type FixCall =
  | { fn: 'available' }
  /**
   * A worktree on a new `fitts/` branch; `base`: the branch to start from. Returns its job id,
   * the branch's final name and the commit it starts from (`sha`).
   */
  | { fn: 'prepare'; runId: string; findingId: string; branch: string; base?: string }
  | { fn: 'read'; job: string; path: string }
  | { fn: 'list'; job: string; dir: string }
  | { fn: 'search'; job: string; text: string }
  /** Read-only text search over the project itself (no worktree): a finding's source (§2.2). */
  | { fn: 'grep'; text: string }
  | { fn: 'patch'; job: string; path: string; find: string; replace: string }
  | { fn: 'write'; job: string; path: string; content: string }
  | { fn: 'diff'; job: string }
  | { fn: 'verify'; job: string; route: string; hrefs: string[] }
  /** `size`: the before shots' size, so before and after line up. */
  | {
      fn: 'verifyPages';
      job: string;
      routes: string[];
      size?: { width: number; height: number };
    }
  /** A redesign's fonts and three.js, copied into the job's static folder (AssetsResult). */
  | { fn: 'assets'; job: string; fonts: FontAsk[]; three: boolean }
  | { fn: 'commit'; job: string; message: string }
  /** Drops a job's uncommitted edits, back to its last commit or to `to` (a failed fix). */
  | { fn: 'reset'; job: string; to?: string }
  /** Runs the project's own test script in the job's worktree (TestRun). */
  | { fn: 'tests'; job: string }
  /**
   * Formats the job's changed files the project's way, then runs its CI checks (CiRun); `only`
   * runs the one check with that name (the fixer's run_check).
   */
  | { fn: 'ci'; job: string; only?: string }
  /** `git revert` of one commit on the job's branch (undo on a shared branch); never forced. */
  | { fn: 'revertCommit'; job: string; sha: string }
  | { fn: 'discard'; job: string }
  /** `base`: open it against that branch instead of the default (a stacked PR). */
  | { fn: 'prOpen'; job: string; title: string; body: string; base?: string }
  /** Pushes a job's new commits to its open PR (a wording undo, an adjusted redesign). */
  | { fn: 'push'; job: string }
  | { fn: 'prClose'; pr: number; branch: string }
  | { fn: 'prMerged'; pr: number }
  /** A revert branch and PR for a merged PR: reverts `sha` (the branch's tip if absent). */
  | {
      fn: 'revert';
      runId: string;
      pr: number;
      branch: string;
      title: string;
      body: string;
      sha?: string;
    };

/** A font a redesign needs, by family (and its Fontsource id when the library knows it). */
export interface FontAsk {
  family: string;
  id?: string;
  weights: number[];
}

/** What `assets` put in the project: the stylesheet and three.js, and fonts it couldn't get. */
export interface AssetsResult {
  /** The fonts stylesheet's URL (served from the static folder). */
  fontsCss?: string;
  /**
   * three.js: a project path to import by relative path from source ("src/fitts/three/…") in a
   * bundler project, or a URL ("/fitts/three/…") on a plain site.
   */
  three?: string;
  fonts: { family: string; weights: number[] }[];
  missing: string[];
}

/** The page probes on a fix's worktree server (§9.2 verification). */
export interface VerifyResult {
  ok: boolean;
  error?: string;
  results: PageProbeResult[];
  focus: ProbeItem[];
  viewport: ProbeItem[];
  links: Record<string, number>;
}

/** The project's own tests in a worktree: `ran` is false when it has no test script. */
/** A project's CI checks (lint, formatting, types) in a job's worktree. */
export interface CiRun {
  /** False when the project's workflows have no checks Fitts can run. */
  ran: boolean;
  checks: { name: string; ok: boolean; summary: string }[];
}

export interface TestRun {
  ran: boolean;
  ok: boolean;
  /** The end of the output, plain text (what failed). */
  summary: string;
}

/** Every page on a redesign's worktree server: its probes and an after shot (§8.3). */
export interface VerifyPagesResult {
  ok: boolean;
  error?: string;
  pages: {
    route: string;
    /** False when the page didn't load (an error page or nothing rendered). */
    loaded: boolean;
    results: PageProbeResult[];
    focus: ProbeItem[];
    viewport: ProbeItem[];
    jpegBase64?: string;
  }[];
}

/** What an action caused: page feedback, the requests it started, and the target's box. */
/** SPEC-phase4 §6B: what the page script reports for the new checks. */
export interface KeyboardFacts {
  interactive: { ref: string; selector: string; name: string }[];
  navLinks: number;
  skipLink: boolean;
}
export interface DialogCheck {
  ref: string;
  selector: string;
  name: string;
  focusMovedIn: boolean;
  tabStaysIn: boolean;
  escCloses: boolean;
  focusReturned: boolean;
}
export interface PageFacts {
  status: number;
  mainText: number;
  errorText?: string;
  headings: string[];
  text: string;
  path?: string;
}

export interface OpTrace {
  feedback: Feedback | null;
  requests: RequestRecord[];
  rect?: SiteRect;
  /** The action tried to open a new tab or leave the site (main blocks both). */
  opened?: boolean;
  /** SPEC-phase4 §6A: no DOM mutations or requests for 300 ms, from the action (ms). */
  settledMs?: number | null;
  /** URL changed → the new page finished loading, from the action (ms). */
  navigationMs?: number | null;
  /** Console errors the page logged during the action (untrusted text, trimmed). */
  console?: { errors: number; first?: string };
  /** Redirect hops the action caused (paths), when there were any. */
  redirects?: string[];
  /** SPEC-phase4 §6B.5: where the target was when Fitts reached for it, and when it tapped. */
  moved?: { decided: { x: number; y: number }; tapped: { x: number; y: number } };
}

export type SiteOpResult =
  | { op: 'snapshot'; snapshot: AxSnapshot }
  | { op: 'screenshot'; jpegBase64: string; width: number; height: number }
  | { op: 'health'; up: boolean; log: string[] }
  | { op: 'restart'; up: boolean }
  | { op: 'action'; path: string; navigated: boolean; trace?: OpTrace }
  | { op: 'probes'; results: PageProbeResult[] }
  | { op: 'items'; items: ProbeItem[] }
  | { op: 'value'; value: string | null }
  | { op: 'device'; previous: string | null }
  | { op: 'breakpoints'; media: string[] }
  | { op: 'keyboard'; stops: TabStop[]; facts: KeyboardFacts }
  | { op: 'dialog'; check: DialogCheck | null }
  | { op: 'facts'; facts: PageFacts }
  | { op: 'surprise'; events: SurpriseEvent[]; inputs: number[] }
  | {
      op: 'fault';
      facts: PageFacts;
      uncaught: number;
      busyWithin1s: boolean;
      jpegBase64?: string;
      results: PageProbeResult[];
    }
  | { op: 'perf'; pages: PagePerf[] }
  | { op: 'ok' }
  | { op: 'links'; statuses: Record<string, number> }
  | { op: 'network'; requests: RequestRecord[] }
  | { op: 'released' }
  | { op: 'rects'; rects: Record<string, SiteRect> }
  | { op: 'revealed' }
  | { op: 'source'; frames: SourceFrame[] }
  | { op: 'sources'; chains: Record<string, SourceFrame[]> }
  | { op: 'replayed'; answer: ReplayAnswer }
  | { op: 'png'; pngBase64: string }
  | { op: 'saved'; url: string }
  | { op: 'reference'; ok: boolean; url: string; shots: string[]; style: string; error?: string }
  | { op: 'fix'; value: unknown };

/** A request paused at `Fetch.requestPaused`, waiting for the gate. */
export interface HeldRequest {
  id: string;
  method: string;
  url: string;
}

/**
 * SPEC-phase4 §3: main asks the agent to understand a project (Pass 1 runs in the agent
 * process so main's loop never blocks; Pass 2 is a model call). `cached`: the model main has for
 * this commit, with the route files' hashes it was built from; `patches`: the owner's
 * corrections, which survive every refresh.
 */
export interface UnderstandAsk {
  projectId: string;
  folder: string;
  /** HEAD's sha, "+dirty" when the tree has changes. */
  commit: string;
  cached?: { model: AppModel; hashes: Record<string, string>; modeled: boolean };
  patches: AppModelPatch[];
}

export type MainMessage =
  | { kind: 'call'; call: EngineCall }
  | { kind: 'understand'; ask: UnderstandAsk }
  /** SPEC-phase4 §4.3: a project's memory (on open, and after Settings changes it). */
  | { kind: 'memory'; projectId: string; memory: ProjectMemory }
  /** The current API keys (from safeStorage, or .env.local in dev builds). */
  | { kind: 'keys'; keys: Partial<Record<KeyName, string>> }
  | { kind: 'testKey'; id: number; name: KeyName; value: string }
  /** A project's live site changed (running / failed / unavailable). */
  | { kind: 'siteStatus'; status: SiteStatus }
  /** A write Fitts's action sent was held for the gate (§13: Fetch interception). */
  | { kind: 'siteHeld'; projectId: string; held: HeldRequest }
  /** A live-site ownership check (§4.2): DNS or the file/meta tag. */
  | { kind: 'verifySite'; id: number; method: 'dns' | 'file'; domain: string; token: string }
  /** Speech in and out, for the cost ledger (§11): stt seconds, tts characters. */
  | {
      kind: 'voiceUsage';
      projectId: string;
      usage: { task: 'stt'; seconds: number } | { task: 'tts'; chars: number };
    }
  | { kind: 'siteResult'; id: number; ok: true; result: SiteOpResult }
  | { kind: 'siteResult'; id: number; ok: false; error: string };

export type AgentMessage =
  | { kind: 'ready' }
  /** A freshly built App Model, for main's cache (never the user's repo). */
  | {
      kind: 'appModel';
      projectId: string;
      model: AppModel;
      hashes: Record<string, string>;
      modeled: boolean;
    }
  /** The owner corrected the model: main keeps the patches beside the cache. */
  | { kind: 'appModelPatch'; projectId: string; patches: AppModelPatch[] }
  /** SPEC-phase4 §4.3: the owner told Fitts something (a rule, a taste); main keeps it. */
  | { kind: 'memoryRule'; projectId: string; rule: MemoryRule }
  | { kind: 'memoryForget'; projectId: string; ruleId: string }
  | { kind: 'memoryTaste'; projectId: string; taste: 'likes' | 'dislikes'; text: string }
  | { kind: 'events'; batch: EngineEvents }
  | { kind: 'keyResult'; id: number; ok: boolean; message: string }
  | { kind: 'verifyResult'; id: number; ok: boolean; message: string }
  | { kind: 'site'; id: number; projectId: string; request: SiteOp }
  | { kind: 'error'; message: string };
