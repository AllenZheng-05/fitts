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
  | { op: 'click'; ref: string }
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
  | { op: 'value'; ref: string }
  | { op: 'links'; hrefs: string[] }
  | { op: 'network' };

/** What an action caused: page feedback, the requests it started, and the target's box. */
export interface OpTrace {
  feedback: Feedback | null;
  requests: RequestRecord[];
  rect?: SiteRect;
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
  | { op: 'links'; statuses: Record<string, number> }
  | { op: 'network'; requests: RequestRecord[] };

export type MainMessage =
  | { kind: 'call'; call: EngineCall }
  /** The current API keys (from safeStorage, or .env.local in dev builds). */
  | { kind: 'keys'; keys: Partial<Record<KeyName, string>> }
  | { kind: 'testKey'; id: number; name: KeyName; value: string }
  /** A project's live site changed (running / failed / unavailable). */
  | { kind: 'siteStatus'; status: SiteStatus }
  | { kind: 'siteResult'; id: number; ok: true; result: SiteOpResult }
  | { kind: 'siteResult'; id: number; ok: false; error: string };

export type AgentMessage =
  | { kind: 'ready' }
  | { kind: 'events'; batch: EngineEvents }
  | { kind: 'keyResult'; id: number; ok: boolean; message: string }
  | { kind: 'site'; id: number; projectId: string; request: SiteOp }
  | { kind: 'error'; message: string };
