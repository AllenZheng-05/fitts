// Messages between main and the agent utility process (process.parentPort).
import type { Feedback, PageProbeName, PageProbeResult, RequestRecord } from '@fitts/probes';
import type {
  EngineCall,
  EngineEvents,
  KeyName,
  ProbeItem,
  SiteRect,
  SiteStatus,
} from '@fitts/schema';

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
  | { op: 'value'; ref: string }
  | { op: 'links'; hrefs: string[] }
  | { op: 'network' }
  /** The gate's answer for a held request (§13): send it, or fail it. */
  | { op: 'release'; id: string; allow: boolean }
  // Media (§10): element boxes, a JPEG as PNG (Muse Image takes PNG), and saving an asset.
  | { op: 'rects'; refs: string[] }
  | { op: 'png'; jpegBase64: string }
  | { op: 'saveAsset'; runId: string; name: string; base64: string }
  /** A site the owner admires, screenshotted as design inspiration (never clicked). */
  | { op: 'reference'; url: string }
  /** The fix pipeline's privileged half, in main (§9). */
  | { op: 'fix'; call: FixCall };

/** Calls to main's FixHost (§9): worktrees, files inside them, verification, git and PRs. */
export type FixCall =
  | { fn: 'available' }
  /** `base`: the branch to start from (later fixes build on a verified redesign, §9.2). */
  | { fn: 'prepare'; runId: string; findingId: string; branch: string; base?: string }
  | { fn: 'read'; job: string; path: string }
  | { fn: 'list'; job: string; dir: string }
  | { fn: 'search'; job: string; text: string }
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
  /** Drops a job's uncommitted edits, back to its last commit (a failed adjustment). */
  | { fn: 'reset'; job: string }
  /** Runs the project's own test script in the job's worktree (TestRun). */
  | { fn: 'tests'; job: string }
  | { fn: 'discard'; job: string }
  /** `base`: open it against that branch instead of the default (a stacked PR). */
  | { fn: 'prOpen'; job: string; title: string; body: string; base?: string }
  /** Pushes a job's new commits to its open PR (a wording undo, an adjusted redesign). */
  | { fn: 'push'; job: string }
  | { fn: 'prClose'; pr: number; branch: string }
  | { fn: 'prMerged'; pr: number }
  | { fn: 'revert'; runId: string; pr: number; branch: string; title: string; body: string }
  | { fn: 'preview'; runId: string; branches: string[] };

/** A font a redesign needs, by family (and its Fontsource id when the library knows it). */
export interface FontAsk {
  family: string;
  id?: string;
  weights: number[];
}

/** What `assets` put in the project: the stylesheet and three.js URLs, and fonts it couldn't get. */
export interface AssetsResult {
  fontsCss?: string;
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
export interface OpTrace {
  feedback: Feedback | null;
  requests: RequestRecord[];
  rect?: SiteRect;
  /** The action tried to open a new tab or leave the site (main blocks both). */
  opened?: boolean;
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
  | { op: 'links'; statuses: Record<string, number> }
  | { op: 'network'; requests: RequestRecord[] }
  | { op: 'released' }
  | { op: 'rects'; rects: Record<string, SiteRect> }
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

export type MainMessage =
  | { kind: 'call'; call: EngineCall }
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
  | { kind: 'events'; batch: EngineEvents }
  | { kind: 'keyResult'; id: number; ok: boolean; message: string }
  | { kind: 'verifyResult'; id: number; ok: boolean; message: string }
  | { kind: 'site'; id: number; projectId: string; request: SiteOp }
  | { kind: 'error'; message: string };
