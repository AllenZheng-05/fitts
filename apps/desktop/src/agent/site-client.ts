// The agent's only way to touch the user's site: RPC to main (SPEC-phase2 §1). Main runs each
// operation on the project's site window (and, from P8, through the permission gate).
import type {
  FaultCase,
  PageProbeName,
  PageProbeResult,
  PagePerf,
  RequestRecord,
  SurpriseEvent,
  TabStop,
} from '@fitts/probes';
import type { DeviceCell, ProbeItem, SiteRect, SourceFrame } from '@fitts/schema';
import type {
  AgentMessage,
  AxSnapshot,
  DialogCheck,
  FixCall,
  KeyboardFacts,
  OpTrace,
  PageFacts,
  SiteOp,
  SiteOpResult,
} from './protocol';
import type { ReplayAnswer, ReplayAsk } from './repro/replay';

export interface ActionResult {
  path: string;
  navigated: boolean;
  /** Feedback and requests the action caused (clicks and typing). */
  trace?: OpTrace;
}

export interface Site {
  snapshot(): Promise<AxSnapshot>;
  screenshot(): Promise<{ jpegBase64: string; width: number; height: number }>;
  navigate(path: string): Promise<ActionResult>;
  /** `destructive`: any write the click sends is held for the gate (§13). */
  click(ref: string, destructive?: boolean): Promise<ActionResult>;
  type(ref: string, text: string): Promise<ActionResult>;
  press(key: string): Promise<ActionResult>;
  back(): Promise<ActionResult>;
  health(): Promise<{ up: boolean; log: string[] }>;
  restart(): Promise<boolean>;
  // Probes (§7)
  probes(names: PageProbeName[]): Promise<PageProbeResult[]>;
  focusSweep(): Promise<ProbeItem[]>;
  viewportSweep(): Promise<ProbeItem[]>;
  /** Look like a device (an id from DEVICES; null: desktop). Resolves to the one it replaced. */
  device?(id: string | null): Promise<string | null>;
  /** SPEC-phase4 §6.3: look like a device cell (null: the panel's size). The one it replaced. */
  cell?(cell: DeviceCell | null): Promise<string | null>;
  /** Tell main the run's cells, so the picker and the replayer know them by id. */
  registerCells?(cells: DeviceCell[]): Promise<void>;
  /** The site's media conditions, as text, for the matrix. */
  breakpoints?(): Promise<string[]>;
  /** The cheap probes in a cell: overflow and the cell's own check (text spacing, 200%, landscape). */
  cellProbes?(cell: DeviceCell): Promise<PageProbeResult[]>;
  // SPEC-phase4 §6B.
  keyboard?(): Promise<{ stops: TabStop[]; facts: KeyboardFacts }>;
  dialog?(): Promise<DialogCheck | null>;
  facts?(path?: string): Promise<PageFacts>;
  surprise?(): Promise<{ events: SurpriseEvent[]; inputs: number[]; clock?: number }>;
  /** SPEC-phase4 §6B.5: the frames around a moment (wall-clock ms). */
  frames?(at: number): Promise<{ at: number; jpegBase64: string; width: number; height: number }[]>;
  fault?(
    route: string,
    endpoint: string,
    fault: FaultCase,
  ): Promise<Extract<SiteOpResult, { op: 'fault' }>>;
  perf?(routes: string[]): Promise<PagePerf[]>;
  value(ref: string): Promise<string | null>;
  links(hrefs: string[]): Promise<Record<string, number>>;
  network(): Promise<RequestRecord[]>;
  /** The gate's answer for a held request (§13). */
  release(id: string, allow: boolean): Promise<void>;
  // Media (§10)
  rects(refs: string[]): Promise<Record<string, SiteRect>>;
  /** Scrolls an element into view, to show what Fitts is about to touch. */
  reveal?(ref: string): Promise<void>;
  /** SPEC-phase4 §2.2: the element's component chain, nearest first (page data, a hint). */
  sourceOf?(ref: string): Promise<SourceFrame[]>;
  /** The chains of every element on the page at once, by ref (a page's first visit). */
  sourcesOf?(refs: string[]): Promise<Record<string, SourceFrame[]>>;
  /** SPEC-phase4 §5.2: replay steps on the hidden replayer and read the oracle's inputs. */
  replay?(ask: ReplayAsk): Promise<ReplayAnswer>;
  png(jpegBase64: string): Promise<string>;
  saveAsset(runId: string, name: string, base64: string): Promise<string>;
  /** A style board (SPEC-phase3 §2): fonts embedded by main, saved as an asset; its URL. */
  board?(
    runId: string,
    name: string,
    html: string,
    fonts: { family: string; id: string; weights: number[] }[],
  ): Promise<string>;
  /** The fix pipeline's privileged half in main (§9). */
  fix(call: FixCall): Promise<unknown>;
  /** A site the owner admires: two screenshots and a style line (design inspiration). */
  reference?(url: string): Promise<{ ok: boolean; shots: string[]; style: string }>;
}

export class SiteRpc {
  private next = 1;
  private readonly pending = new Map<
    number,
    { resolve: (r: SiteOpResult) => void; reject: (e: Error) => void }
  >();

  constructor(private readonly send: (m: AgentMessage) => void) {}

  resolve(id: number, ok: boolean, result: SiteOpResult | undefined, error?: string): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    if (ok && result) p.resolve(result);
    else p.reject(new Error(error ?? 'site operation failed'));
  }

  private request(projectId: string, request: SiteOp): Promise<SiteOpResult> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ kind: 'site', id, projectId, request });
    });
  }

  /** A typed facade for one project. */
  for(projectId: string): Site {
    const expect = async <K extends SiteOpResult['op']>(request: SiteOp, op: K) => {
      const r = await this.request(projectId, request);
      if (r.op !== op) throw new Error('unexpected site result');
      return r as Extract<SiteOpResult, { op: K }>;
    };
    const action = async (request: SiteOp): Promise<ActionResult> => {
      const r = await expect(request, 'action');
      return { path: r.path, navigated: r.navigated, ...(r.trace ? { trace: r.trace } : {}) };
    };
    return {
      snapshot: async () => (await expect({ op: 'snapshot' }, 'snapshot')).snapshot,
      screenshot: () => expect({ op: 'screenshot' }, 'screenshot'),
      navigate: (path) => action({ op: 'navigate', path }),
      click: (ref, destructive) =>
        action({ op: 'click', ref, ...(destructive ? { destructive: true } : {}) }),
      type: (ref, text) => action({ op: 'type', ref, text }),
      press: (key) => action({ op: 'press', key }),
      back: () => action({ op: 'back' }),
      health: async () => {
        const r = await this.request(projectId, { op: 'health' });
        return r.op === 'health' ? { up: r.up, log: r.log } : { up: false, log: [] };
      },
      restart: async () => {
        const r = await this.request(projectId, { op: 'restart' });
        return r.op === 'restart' && r.up;
      },
      probes: async (names) => (await expect({ op: 'probes', names }, 'probes')).results,
      focusSweep: async () => (await expect({ op: 'focus' }, 'items')).items,
      viewportSweep: async () => (await expect({ op: 'viewport' }, 'items')).items,
      device: async (id) => (await expect({ op: 'device', id }, 'device')).previous,
      cell: async (cell) => (await expect({ op: 'cell', cell }, 'device')).previous,
      registerCells: async (cells) => {
        await expect({ op: 'cells', cells }, 'ok');
      },
      breakpoints: async () => (await expect({ op: 'breakpoints' }, 'breakpoints')).media,
      cellProbes: async (cell) => (await expect({ op: 'cellProbes', cell }, 'probes')).results,
      keyboard: async () => {
        const r = await expect({ op: 'keyboard' }, 'keyboard');
        return { stops: r.stops, facts: r.facts };
      },
      dialog: async () => (await expect({ op: 'dialog' }, 'dialog')).check,
      facts: async (path) =>
        (await expect({ op: 'facts', ...(path ? { path } : {}) }, 'facts')).facts,
      surprise: async () => {
        const r = await expect({ op: 'surprise' }, 'surprise');
        return {
          events: r.events,
          inputs: r.inputs,
          ...(r.clock !== undefined ? { clock: r.clock } : {}),
        };
      },
      frames: async (at) => (await expect({ op: 'frames', at }, 'frames')).frames,
      fault: (route, endpoint, fault) => expect({ op: 'fault', route, endpoint, fault }, 'fault'),
      perf: async (routes) => (await expect({ op: 'perf', routes }, 'perf')).pages,
      value: async (ref) => (await expect({ op: 'value', ref }, 'value')).value,
      links: async (hrefs) => (await expect({ op: 'links', hrefs }, 'links')).statuses,
      network: async () => (await expect({ op: 'network' }, 'network')).requests,
      release: async (id, allow) => {
        await expect({ op: 'release', id, allow }, 'released');
      },
      fix: async (call) => (await expect({ op: 'fix', call }, 'fix')).value,
      reference: async (url) => {
        const r = await expect({ op: 'reference', url }, 'reference');
        return { ok: r.ok, shots: r.shots, style: r.style };
      },
      rects: async (refs) => (await expect({ op: 'rects', refs }, 'rects')).rects,
      reveal: async (ref) => {
        await expect({ op: 'reveal', ref }, 'revealed');
      },
      sourceOf: async (ref) => (await expect({ op: 'source', ref }, 'source')).frames,
      sourcesOf: async (refs) => (await expect({ op: 'sources', refs }, 'sources')).chains,
      replay: async (ask) => (await expect({ op: 'replay', ask }, 'replayed')).answer,
      png: async (jpegBase64) => (await expect({ op: 'png', jpegBase64 }, 'png')).pngBase64,
      saveAsset: async (runId, name, base64) =>
        (await expect({ op: 'saveAsset', runId, name, base64 }, 'saved')).url,
      board: async (runId, name, html, fonts) =>
        (await expect({ op: 'board', runId, name, html, fonts }, 'saved')).url,
    };
  }
}
