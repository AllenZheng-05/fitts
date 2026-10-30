import type { RunEvent } from './events';

// Shared types for main, preload and renderer. No React or Electron imports here.
// The run model is SPEC §9.1; additions are marked and explained in docs/DECISIONS.md.

export type Platform = 'darwin' | 'win32' | 'linux';

/** The typed API the preload exposes as `window.fitts` (SPEC §3, §13). */
export interface FittsBridge {
  platform: Platform;
  /** Native folder picker. Resolves to the chosen path, or null when cancelled. */
  pickFolder(): Promise<string | null>;
  /** Native save dialog that writes `content` to the chosen file. Resolves to the path. */
  saveTextFile(suggestedName: string, content: string): Promise<string | null>;
  /** A real OS notification. Clicking it focuses the window and calls the click handler. */
  notify(notification: { id: string; title: string; body: string }): void;
  /** Called with the notification id when the user clicks one. Returns an unsubscribe. */
  onNotificationClick(handler: (id: string) => void): () => void;

  // Phase 2 (SPEC-phase2 §12, §15). Optional so stand-ins without them still type-check.
  /** The real engine: calls go to the agent process; events come back. */
  engine?: EngineBridge;
  /** The file-based project store (`userData/projects/`). */
  store?: StoreBridge;
  /** API keys in safeStorage. The renderer only ever learns whether a key exists. */
  keys?: KeysBridge;
  /** The user's site: dev server, offscreen window, frames, input, CDP queries (§5). */
  site?: SiteBridge;
  /** Transcribe (the mic) and ElevenLabs (Fitts's voice), held by main (§14). */
  voice?: VoiceBridge;
}

/** Push to talk for the mic button; endpointing for "Always listening" (V5). */
export type TalkSessionMode = 'PUSH_TO_TALK' | 'ENDPOINTING';

/** What main tells the renderer about a voice session or a spoken line (§14). */
export type VoiceEvent =
  | { kind: 'partial'; text: string }
  | { kind: 'final'; text: string }
  /** The user started talking (barge-in). */
  | { kind: 'speech' }
  | { kind: 'error'; text: string }
  | { kind: 'closed' }
  | { kind: 'spoken'; id: number }
  | { kind: 'speakError'; id: number; text: string };

export interface VoiceBridge {
  /** Opens a Transcribe session; `ok: false` (offline, no key) means use the fallback. */
  start(mode: TalkSessionMode, projectId: string): Promise<{ ok: boolean; reason?: string }>;
  /** 24 kHz s16le mono PCM. */
  audio(pcm: ArrayBuffer): void;
  end(): void;
  cancel(): void;
  /** Streams one line with ElevenLabs; `ok: false` means use the OS voice. */
  speak(text: string, voiceId: string, projectId: string): Promise<{ ok: boolean; id: number }>;
  stopSpeaking(): void;
  onEvent(handler: (event: VoiceEvent) => void): () => void;
  onAudio(handler: (id: number, pcm: ArrayBuffer) => void): () => void;
}

/** What Fitts finds in a project folder (SPEC-phase2 §4.1; the Phase 1 mock's shape). */
export interface Detection {
  id: string;
  name: string;
  framework: string;
  devCommand: string;
  url: string;
  repo?: string;
  hasPlugin: boolean;
  /** Real detection only. */
  port?: number;
  startPath?: string;
  ghReady?: boolean;
}

export interface SiteRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The live site's state, pushed by main. */
export interface SiteStatus {
  projectId: string;
  status: 'starting' | 'running' | 'failed' | 'unavailable';
  url?: string;
  canBack?: boolean;
  canForward?: boolean;
  cursor?: string;
  /** The dev server's last lines, for the site-down card. */
  log?: string[];
}

export type SiteInput =
  | {
      kind: 'mouse';
      type: 'mouseDown' | 'mouseUp' | 'mouseMove';
      x: number;
      y: number;
      button?: 'left' | 'right' | 'middle';
      clickCount?: number;
    }
  | { kind: 'wheel'; x: number; y: number; deltaX: number; deltaY: number }
  | {
      kind: 'key';
      type: 'keyDown' | 'keyUp' | 'char';
      keyCode: string;
      modifiers?: ('shift' | 'control' | 'alt' | 'meta')[];
    };

export type SiteNav =
  { kind: 'path'; path: string } | { kind: 'back' } | { kind: 'forward' } | { kind: 'reload' };

export interface SiteBridge {
  /** Real detection, or null when the folder doesn't exist. */
  detect(folder: string): Promise<Detection | null>;
  /** Starts (or reuses) the project's dev server and opens its site window. */
  open(projectId: string): void;
  close(projectId: string): void;
  resize(projectId: string, width: number, height: number): void;
  input(projectId: string, input: SiteInput): void;
  nav(projectId: string, nav: SiteNav): void;
  /** Element boxes by ref, in site CSS px. */
  rects(projectId: string, refs: string[]): Promise<Record<string, SiteRect>>;
  refAt(projectId: string, x: number, y: number): Promise<string | null>;
  /** The element at a point with its accessible name ("You clicked …" while driving). */
  elementAt(
    projectId: string,
    x: number,
    y: number,
  ): Promise<{ ref: string; label: string } | null>;
  onFrame(
    projectId: string,
    handler: (jpeg: Uint8Array, width: number, height: number) => void,
  ): () => void;
  onStatus(handler: (status: SiteStatus) => void): () => void;
}

/** RunEngine methods the renderer may call over IPC (everything but getState/subscribe). */
export const ENGINE_METHODS = [
  'startInterview',
  'answerInterview',
  'startAudit',
  'pause',
  'resume',
  'stopAction',
  'stopRun',
  'takeWheel',
  'handBack',
  'sendMessage',
  'interruptNow',
  'answerQuestion',
  'approveFixes',
  'dismissFinding',
  'respondGate',
  'setMode',
  'pickDirection',
  'decideWording',
  'undoChange',
  'retryChange',
  'rewindTo',
  'updateBrief',
] as const;
export type EngineMethod = (typeof ENGINE_METHODS)[number];

/** Calls the P1 stub agent also accepts (Phase 1 mock extras; P2 moves them into main). */
export const STUB_ENGINE_METHODS = ['recordUserClick', 'setSpeed', 'llmPing'] as const;
export type StubEngineMethod = (typeof STUB_ENGINE_METHODS)[number];

/** A renderer → agent engine call. `brief` is the project's saved brief, for the interview. */
export interface EngineCall {
  projectId: string;
  method: EngineMethod | StubEngineMethod;
  args: unknown[];
  brief?: Brief;
  /** The settings a run reads when it starts (budget cap, models). */
  settings?: {
    capUsd: number;
    modelProfile: 'quality' | 'economy' | 'open';
    contributorMode: boolean;
  };
}

/** Events for one project, in order, as one batch (one agent state change). */
export interface EngineEvents {
  projectId: string;
  runId: string;
  seq: number;
  events: RunEvent[];
}

export interface EngineBridge {
  call(call: EngineCall): void;
  onEvents(handler: (batch: EngineEvents) => void): () => void;
  /** Every run main knows about, for a renderer that (re)loads mid-run. */
  states(): Promise<Record<string, RunState>>;
}

export interface StoreBridge {
  /** The persisted projects blob, read synchronously once at startup (null if none). */
  loadProjects(): string | null;
  saveProjects(blob: string): void;
}

export type KeyName = 'meta' | 'elevenlabs' | 'baseten';

export interface KeysBridge {
  set(name: KeyName, value: string): Promise<void>;
  clear(name: KeyName): Promise<void>;
  /** Checks a key (the stored one if `value` is omitted) with its provider. */
  test(name: KeyName, value?: string): Promise<{ ok: boolean; message: string }>;
  has(): Promise<Record<KeyName, boolean>>;
}

/** IPC channel names shared by main and preload. */
export const IPC = {
  pickFolder: 'fitts:pick-folder',
  saveTextFile: 'fitts:save-text-file',
  notify: 'fitts:notify',
  notificationClick: 'fitts:notification-click',
  engineCall: 'fitts:engine-call',
  engineEvents: 'fitts:engine-events',
  engineStates: 'fitts:engine-states',
  projectsLoad: 'fitts:projects-load',
  projectsSave: 'fitts:projects-save',
  keysSet: 'fitts:keys-set',
  keysClear: 'fitts:keys-clear',
  keysTest: 'fitts:keys-test',
  keysHas: 'fitts:keys-has',
  siteDetect: 'fitts:site-detect',
  siteOpen: 'fitts:site-open',
  siteClose: 'fitts:site-close',
  siteResize: 'fitts:site-resize',
  siteInput: 'fitts:site-input',
  siteNav: 'fitts:site-nav',
  siteRects: 'fitts:site-rects',
  siteRefAt: 'fitts:site-ref-at',
  siteElementAt: 'fitts:site-element-at',
  siteFrame: 'fitts:site-frame',
  siteStatus: 'fitts:site-status',
  voiceStart: 'fitts:voice-start',
  voiceAudioIn: 'fitts:voice-audio-in',
  voiceEnd: 'fitts:voice-end',
  voiceCancel: 'fitts:voice-cancel',
  voiceEvent: 'fitts:voice-event',
  voiceSpeak: 'fitts:voice-speak',
  voiceAudio: 'fitts:voice-audio',
  voiceStopSpeaking: 'fitts:voice-stop-speaking',
} as const;

export type Mode = 'plan' | 'ask-every' | 'ask-unsure' | 'autonomous' | 'dangerous';
/** Nielsen severity: 0 not a problem … 4 catastrophic. */
export type Severity = 0 | 1 | 2 | 3 | 4;
export type Heuristic = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8' | 'H9' | 'H10';
export type Lens =
  'usability' | 'accessibility' | 'performance' | 'look-and-feel' | 'ergonomics' | 'content';
export type RunPhase = 'interview' | 'audit' | 'done';
export type RunActivity =
  'idle' | 'acting' | 'paused' | 'user-driving' | 'waiting-on-user' | 'redesigning';

export interface Project {
  id: string;
  name: string;
  kind: 'local' | 'live';
  folder?: string;
  url: string;
  framework?: string;
  devCommand?: string;
  repo?: string;
  brief: Brief;
  lastRunId?: string;
  createdAt: string;
  /** SPEC-phase2 §12.2: how a live site proved ownership. */
  verification?: { method: 'host' | 'dns' | 'file'; host?: string; verifiedAt: string };
  /** SPEC-phase2 §12.2: where the site view opens (demo/chat uses /compose). */
  startPath?: string;
}

export interface Brief {
  for?: string;
  who?: string;
  feel?: string;
  pain?: string;
  flows?: string;
  outOfScope?: string;
}

export interface Finding {
  id: string;
  runId: string;
  severity: Severity;
  heuristic?: Heuristic;
  lens: Lens;
  title: string;
  finding: string;
  fix: string;
  route: string;
  agreement: { agreeing: number; total: number; who: string[] };
  evidence: string[];
  elementRef?: string;
  stepIndex: number;
  atMs: number;
  diff?: { files: string[]; lines: { kind: 'add' | 'del'; text: string }[] };
  status: 'open' | 'dismissed' | 'fixing' | 'verified' | 'pr-opened' | 'rolled-back' | 'undone';
  prNumber?: number;
  costUsd?: number;

  // SPEC-phase2 §12.2 additions (all optional).
  /** `suggestion`: not enough evidence to show; counted on Done and listed in the report. */
  lane?: 'shown' | 'suggestion';
  /** Same issue on several screens. */
  locations?: { route: string; elementRef?: string; stepIndex: number }[];
  /** Where the element is rendered, and how sure Fitts is (§9.1). */
  source?: {
    file: string;
    line: number;
    col?: number;
    confidence: 'plugin' | 'source-map' | 'search';
  };
  /** Asset ids (fitts-asset://) for the step shot, the after shot, the SAM mask, the mockup. */
  assets?: { shot?: string; after?: string; mask?: string; mockup?: string };
  prUrl?: string;
}

export interface Change {
  id: string;
  findingIds: string[];
  kind: 'fix' | 'batch' | 'redesign' | 'wording';
  title: string;
  severity?: Severity;
  prNumber?: number;
  costUsd: number;
  status: 'verified' | 'rolled-back' | 'undone' | 'retrying';
  merged?: boolean;
  reason?: string;
  /** SPEC-phase2 §12.2: the `fitts/…` branch and the PR's URL. */
  branch?: string;
  prUrl?: string;
}

export interface GateRequest {
  id: string;
  action: string;
  route: string;
  heldRequest: string;
  testing: string;
}

export type ChatItem =
  | { id: string; type: 'fitts.message'; text: string }
  | { id: string; type: 'user.message'; text: string; spoken?: boolean; pointingAt?: string }
  | { id: string; type: 'fitts.thinking'; text: string }
  | { id: string; type: 'steps'; steps: { label: string; costUsd: number }[] }
  | { id: string; type: 'finding'; findingId: string }
  | {
      id: string;
      type: 'question';
      blocking: boolean;
      text: string;
      options: string[];
      answer?: string;
    }
  | { id: string; type: 'approval.batch'; findingIds: string[]; serious: number; answer?: string }
  | { id: string; type: 'fix.result'; changeId: string }
  | { id: string; type: 'brief' }
  | { id: string; type: 'quick-replies'; options: string[]; used?: boolean }
  | { id: string; type: 'lookfeel'; text: string }
  | {
      id: string;
      type: 'directions';
      /** `mockup` (SPEC-phase2 §10): a Muse Image picture of the direction, an asset URL. */
      options: { id: string; name: string; swatches: string[]; mockup?: string }[];
      selectedId?: string;
    }
  | {
      id: string;
      type: 'progress';
      title: string;
      items: { text: string; state: 'done' | 'doing' | 'todo' }[];
    }
  | { id: string; type: 'wording'; from: string; to: string; decision?: 'keep' | 'undo' }
  // `answer` (addition): which button the user pressed on an edge-state card.
  | { id: string; type: 'state'; stateKind: EdgeStateKind; answer?: string }
  | { id: string; type: 'driving' };

export type ChatItemType = ChatItem['type'];

export type EdgeStateKind =
  | 'stop-run-confirm'
  | 'stopped'
  | 'uncommitted'
  | 'login-wall'
  | 'site-down'
  | 'budget-warning'
  | 'budget'
  | 'api-trouble'
  | 'reopen'
  | 'nothing-found';

export type CostPhase = 'fixes' | 'reviewers' | 'crawling' | 'summing' | 'media';

/** SPEC-phase2 §11: what a model call was for. Rolls up into the five CostPhase values. */
export type CostTask =
  | 'interview'
  | 'crawl'
  | 'review'
  | 'aggregate'
  | 'themefit'
  | 'fix'
  | 'sam'
  | 'image'
  | 'stt'
  | 'tts';

/** One ledger entry (SPEC-phase2 §11). Every number is an estimate. */
export interface CostEvent {
  ts: string;
  runId: string;
  projectId: string;
  task: CostTask;
  phase: CostPhase;
  provider: 'meta' | 'baseten' | 'elevenlabs';
  model: string;
  contributor: boolean;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  images?: number;
  samImages?: number;
  audioSeconds?: number;
  ttsChars?: number;
  usd: number;
  latencyMs: number;
  findingId?: string;
  priceTable: string;
}

export interface RunState {
  runId: string;
  projectId: string;
  phase: RunPhase;
  activity: RunActivity;
  mode: Mode;
  step: number;
  stepEstimate: number;
  elapsedMs: number;
  nowText?: string;
  routes: {
    path: string;
    depth: number;
    status: 'done' | 'testing' | 'queued';
    issues: number;
    label?: string;
  }[];
  controlsTried: { done: number; total: number };
  findings: Finding[];
  changes: Change[];
  chat: ChatItem[];
  queued: string[];
  overlays: {
    problems: { ref: string; pin: number }[];
    attention?: { ref: string; label: string };
  };
  gate?: GateRequest;
  rewindStep?: number;
  fixingCount: number;
  cost: { spentUsd: number; capUsd: number; byPhase: Record<CostPhase, number> };

  // Additions to SPEC §9.1 (see docs/DECISIONS.md, M2).
  /** The brief as the interview fills it in; saved back to the Project. */
  brief: Brief;
  /** Fitts is about to reply: the three-dot typing indicator (§6.3). */
  fittsTyping: boolean;
  /** The gating beat the script is held on: `question:<itemId>`, `gate` or `approval`. */
  waitingFor?: string;
  /** "You clicked …" lines logged while the user has the wheel (§7.3). */
  driverClicks: string[];
}

/** SPEC §9.2: the UI talks only to this interface. Phase 2 implements it over IPC. */
export interface RunEngine {
  getState(projectId: string): RunState | undefined;
  subscribe(projectId: string, fn: (s: RunState) => void): () => void;

  startInterview(projectId: string): void;
  answerInterview(projectId: string, text: string): void;
  /** Also "Skip, just look around". */
  startAudit(projectId: string): void;
  pause(projectId: string): void;
  resume(projectId: string): void;
  /** ⌘. */
  stopAction(projectId: string): void;
  /** Asks first: posts the stop-run confirm card, answered through `answerQuestion`. */
  stopRun(projectId: string): void;
  takeWheel(projectId: string): void;
  handBack(projectId: string): void;
  sendMessage(
    projectId: string,
    text: string,
    opts?: { pointingAt?: string; spoken?: boolean },
  ): void;
  interruptNow(projectId: string): void;
  /** Answers a question card or an edge-state card. */
  answerQuestion(projectId: string, itemId: string, answer: string): void;
  approveFixes(projectId: string, findingIds: string[]): void;
  dismissFinding(projectId: string, findingId: string): void;
  respondGate(projectId: string, gateId: string, decision: 'deny' | 'other' | 'allow'): void;
  setMode(projectId: string, mode: Mode): void;
  pickDirection(projectId: string, directionId: string): void;
  decideWording(projectId: string, itemId: string, decision: 'keep' | 'undo'): void;
  undoChange(projectId: string, changeId: string): void;
  retryChange(projectId: string, changeId: string): void;
  rewindTo(projectId: string, stepIndex: number | null): void;
  /** Addition to §9.2: the Brief popover's Save (§6.10). Fitts acknowledges in chat. */
  updateBrief(projectId: string, brief: Brief): void;
}

/**
 * Answer keys for each edge-state card (SPEC §7.7). Cards pass one of these to
 * `RunEngine.answerQuestion`; the UI maps each key to its button label in copy.ts.
 */
export const EDGE_STATE_ANSWERS = {
  'stop-run-confirm': ['stop', 'keep'],
  stopped: ['resume', 'skip', 'wheel'],
  uncommitted: ['save', 'commit-first'],
  'login-wall': ['wheel', 'add-login', 'skip'],
  'site-down': ['restart', 'wait'],
  'budget-warning': ['economy', 'keep'],
  budget: ['add-10', 'stop'],
  'api-trouble': ['retry-now', 'pause'],
  reopen: ['resume', 'summary'],
  'nothing-found': ['see-checks', 'finish'],
} as const satisfies Record<EdgeStateKind, readonly string[]>;

export type EdgeStateAnswer<K extends EdgeStateKind = EdgeStateKind> =
  (typeof EDGE_STATE_ANSWERS)[K][number];

export * from './events';

// ── Probes (SPEC-phase2 §7) ─────────────────────────────────────────────────

export type ProbeName =
  | 'contrast'
  | 'target-size'
  | 'fitts-id'
  | 'font-inventory'
  | 'spacing'
  | 'label-consistency'
  | 'feedback-timing'
  | 'back-mid-flow'
  | 'error-message'
  | 'placeholder-leak'
  | 'focus-visible'
  | 'button-name'
  | 'link-name'
  | 'links'
  | 'network'
  | 'web-vitals'
  | 'viewport-sweep';

/** One element (or request) a probe measured. `measured` and `expected` are plain language. */
export interface ProbeItem {
  ref: string;
  selector: string;
  measured: string;
  expected: string;
  /** `data-fitts-src` of the element or its nearest stamped ancestor. */
  src?: string;
}

/** A probe's result on one route; reviewers cite it by `evidenceId` (P6). */
export interface ProbeResult {
  evidenceId: string;
  probe: ProbeName;
  route: string;
  pass: boolean;
  items: ProbeItem[];
  /** One plain sentence ("3 font families: georgia, system-ui, trebuchet ms"). */
  summary?: string;
}

/** One reviewer's finding draft (finding.schema.json, SPEC-phase2 §8.1). */
export interface FindingDraft {
  title: string;
  finding: string;
  fix: string;
  heuristic: Heuristic | null;
  lens: Lens;
  severity: number;
  elementRef: string | null;
  evidenceIds: string[];
  evidence: string[];
}

export { default as FINDING_DRAFTS_FORMAT } from './finding.schema.json';
