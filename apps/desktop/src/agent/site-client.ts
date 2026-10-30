// The agent's only way to touch the user's site: RPC to main (SPEC-phase2 §1). Main runs each
// operation on the project's site window (and, from P8, through the permission gate).
import type { PageProbeName, PageProbeResult, RequestRecord } from '@fitts/probes';
import type { ProbeItem, SiteRect } from '@fitts/schema';
import type { AgentMessage, AxSnapshot, FixCall, OpTrace, SiteOp, SiteOpResult } from './protocol';

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
  value(ref: string): Promise<string | null>;
  links(hrefs: string[]): Promise<Record<string, number>>;
  network(): Promise<RequestRecord[]>;
  /** The gate's answer for a held request (§13). */
  release(id: string, allow: boolean): Promise<void>;
  // Media (§10)
  rects(refs: string[]): Promise<Record<string, SiteRect>>;
  png(jpegBase64: string): Promise<string>;
  saveAsset(runId: string, name: string, base64: string): Promise<string>;
  /** The fix pipeline's privileged half in main (§9). */
  fix(call: FixCall): Promise<unknown>;
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
      value: async (ref) => (await expect({ op: 'value', ref }, 'value')).value,
      links: async (hrefs) => (await expect({ op: 'links', hrefs }, 'links')).statuses,
      network: async () => (await expect({ op: 'network' }, 'network')).requests,
      release: async (id, allow) => {
        await expect({ op: 'release', id, allow }, 'released');
      },
      fix: async (call) => (await expect({ op: 'fix', call }, 'fix')).value,
      rects: async (refs) => (await expect({ op: 'rects', refs }, 'rects')).rects,
      png: async (jpegBase64) => (await expect({ op: 'png', jpegBase64 }, 'png')).pngBase64,
      saveAsset: async (runId, name, base64) =>
        (await expect({ op: 'saveAsset', runId, name, base64 }, 'saved')).url,
    };
  }
}
