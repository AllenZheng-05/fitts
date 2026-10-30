// The agent's only way to touch the user's site: RPC to main (SPEC-phase2 §1). Main runs each
// operation on the project's site window (and, from P8, through the permission gate).
import type { AgentMessage, AxSnapshot, SiteOp, SiteOpResult } from './protocol';

export interface Site {
  snapshot(): Promise<AxSnapshot>;
  screenshot(): Promise<{ jpegBase64: string; width: number; height: number }>;
  navigate(path: string): Promise<{ path: string; navigated: boolean }>;
  click(ref: string): Promise<{ path: string; navigated: boolean }>;
  type(ref: string, text: string): Promise<{ path: string; navigated: boolean }>;
  press(key: string): Promise<{ path: string; navigated: boolean }>;
  back(): Promise<{ path: string; navigated: boolean }>;
  health(): Promise<{ up: boolean; log: string[] }>;
  restart(): Promise<boolean>;
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
    const action = async (request: SiteOp) => {
      const r = await this.request(projectId, request);
      if (r.op !== 'action') throw new Error('unexpected site result');
      return { path: r.path, navigated: r.navigated };
    };
    return {
      snapshot: async () => {
        const r = await this.request(projectId, { op: 'snapshot' });
        if (r.op !== 'snapshot') throw new Error('unexpected site result');
        return r.snapshot;
      },
      screenshot: async () => {
        const r = await this.request(projectId, { op: 'screenshot' });
        if (r.op !== 'screenshot') throw new Error('unexpected site result');
        return r;
      },
      navigate: (path) => action({ op: 'navigate', path }),
      click: (ref) => action({ op: 'click', ref }),
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
    };
  }
}
