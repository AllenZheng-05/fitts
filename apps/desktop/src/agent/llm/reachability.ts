// SPEC-phase4 §6C: when Meta's models can't be reached, Fitts waits for them; it never carries
// on without them. A call that finds a provider unreachable waits here; while any provider is
// down, a no-cost check (GET /v1/models, through `ping`) runs every 10 seconds, and when it
// answers every waiting call is retried, exactly as it was. Listeners pause and resume the
// runs and interviews whose calls were waiting. No network of its own: `ping` is injected.
import type { Provider } from './call';

export type Ping = (provider: Provider) => Promise<boolean>;

export interface ReachabilityListener {
  /** A project's call found the models unreachable (once per outage per project). */
  down(projectId: string): void;
  /** Everything answers again: the projects that were waiting, so they resume. */
  up(projectIds: string[]): void;
}

/** How often the no-cost check runs while a provider is down. */
export const PING_EVERY_MS = 10_000;

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

export class Reachability {
  private readonly downProviders = new Set<Provider>();
  private readonly waiters = new Map<Provider, Set<() => void>>();
  private readonly projects = new Set<string>();
  private readonly listeners = new Set<ReachabilityListener>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private since: number | undefined;
  private checking: Promise<void> | undefined;

  constructor(
    private readonly ping: Ping,
    private readonly opts: { intervalMs?: number; now?: () => number } = {},
  ) {}

  /** Some provider isn't answering. */
  get down(): boolean {
    return this.downProviders.size > 0;
  }

  /** When the outage began (ms since epoch), while there is one. */
  get downSince(): number | undefined {
    return this.since;
  }

  on(listener: ReachabilityListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * A call found `provider` unreachable: resolves when it answers again (so the call is retried),
   * rejects only when `signal` aborts (the run stopped, or ⌘.).
   */
  wait(provider: Provider, projectId: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError());
    this.downProviders.add(provider);
    this.since ??= (this.opts.now ?? Date.now)();
    if (!this.projects.has(projectId)) {
      this.projects.add(projectId);
      for (const l of this.listeners) l.down(projectId);
    }
    this.timer ??= setInterval(() => void this.check(), this.opts.intervalMs ?? PING_EVERY_MS);
    return new Promise<void>((resolve, reject) => {
      let set = this.waiters.get(provider);
      if (!set) {
        set = new Set();
        this.waiters.set(provider, set);
      }
      const waiting = set;
      const onAbort = () => {
        waiting.delete(done);
        reject(abortError());
      };
      const done = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      waiting.add(done);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** "Retry now": the check, right away. */
  retryNow(): Promise<void> {
    return this.check();
  }

  /** One round of the no-cost check for every provider that's down. */
  check(): Promise<void> {
    this.checking ??= this.checkOnce().finally(() => (this.checking = undefined));
    return this.checking;
  }

  private async checkOnce(): Promise<void> {
    const back: Provider[] = [];
    for (const p of [...this.downProviders]) {
      let ok = false;
      try {
        ok = await this.ping(p);
      } catch {
        ok = false;
      }
      if (ok) back.push(p);
    }
    if (back.length === 0) return;
    for (const p of back) this.downProviders.delete(p);
    // The runs resume first, so a call that returns finds its run acting, not paused.
    if (this.downProviders.size === 0) {
      if (this.timer) clearInterval(this.timer);
      this.timer = undefined;
      this.since = undefined;
      const projects = [...this.projects];
      this.projects.clear();
      for (const l of this.listeners) l.up(projects);
    }
    for (const p of back) {
      const set = this.waiters.get(p);
      this.waiters.delete(p);
      for (const done of set ?? []) done();
    }
  }

  /** Does the provider answer right now? (Starting an audit checks first.) */
  async answers(provider: Provider = 'meta'): Promise<boolean> {
    try {
      return await this.ping(provider);
    } catch {
      return false;
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
