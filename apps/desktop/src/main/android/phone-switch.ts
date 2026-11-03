// The one emulator between the live app and a run's fixed version (Allen, Nov 2). The fixed
// version runs from the run branch's view worktree on its own Metro, and the dev client is
// reopened on it; going back reopens the live Metro (8081), takes the reverse back and stops the
// worktree's Metro. Calls are serialized, so a switch never interleaves with another, and the
// live app is restored on every way out (a failed switch included). Nothing here touches the
// user's working tree: the view worktree is Fitts's own.
import type { RunState } from '@fitts/schema';
import type { Adb } from './adb';

/** Metro for a folder on a port, as DevServer runs it. */
export interface Metro {
  start(timeoutMs: number): Promise<boolean>;
  stop(): void;
  /** It has served the app a bundle ("Android Bundled ..."): the device runs this Metro's code. */
  served(): boolean;
}

export interface PhoneSwitchDeps {
  /** The device, or undefined when no emulator is running. */
  adb: () => Promise<Adb | undefined>;
  /** The app's slug (app.json), for the dev client's URL. */
  slug: string;
  /** The live Metro's port. */
  livePort: number;
  metro: (dir: string, port: number) => Metro;
  freePort: () => Promise<number>;
  releasePort: (port: number) => void;
  /** Waits between polls; tests pass a fast one. */
  sleep?: (ms: number) => Promise<void>;
}

export type PhoneShowing = { kind: 'live' } | { kind: 'fixed'; branch: string };
export type FixedResult =
  { ok: true } | { ok: false; reason: 'no-emulator' | 'metro' | 'dev-client' };

/** How long a reopen has to clear the screen it started from. */
const CLEAR_MS = 8000;
/** A fresh Metro's first bundle. */
const OPEN_MS = 120_000;
const METRO_MS = 180_000;

export class PhoneSwitch {
  private showing: PhoneShowing = { kind: 'live' };
  private current: { adb: Adb; port: number; metro: Metro } | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly deps: PhoneSwitchDeps,
    /** Told after every switch (the site view's label). */
    private readonly onChange: (showing: PhoneShowing) => void = () => undefined,
  ) {
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  state(): PhoneShowing {
    return this.showing;
  }

  /** The fixed version from `dir` (the branch's view worktree). */
  showFixed(dir: string, branch: string): Promise<FixedResult> {
    return this.serial(async () => {
      if (this.showing.kind === 'fixed' && this.showing.branch === branch) return { ok: true };
      await this.back();
      const adb = await this.deps.adb();
      if (!adb) return { ok: false, reason: 'no-emulator' };
      const port = await this.deps.freePort();
      const metro = this.deps.metro(dir, port);
      this.current = { adb, port, metro };
      if (!(await metro.start(METRO_MS))) {
        await this.back();
        return { ok: false, reason: 'metro' };
      }
      const opened =
        (await adb.reverse(port)) &&
        (await adb.open(this.url(port))) &&
        (await this.ready(adb, metro));
      if (!opened) {
        await this.back();
        return { ok: false, reason: 'dev-client' };
      }
      this.set({ kind: 'fixed', branch });
      return { ok: true };
    });
  }

  /** Back to the live app (a no-op when it's already showing). */
  showLive(): Promise<void> {
    return this.serial(() => this.back());
  }

  /** The dev client's URL for a Metro on `port`. */
  private url(port: number): string {
    const metro = encodeURIComponent(`http://127.0.0.1:${port}`);
    return `exp+${this.deps.slug}://expo-development-client/?url=${metro}`;
  }

  /**
   * The reopened app, running the worktree Metro's code: that Metro has served it a bundle
   * (a fresh Metro's first bundle takes a minute or more, and until then the device keeps
   * showing the app it had: Nov 2, the bench shot the live app under a "Fixed version" label),
   * and then the screen has controls again.
   */
  private async ready(adb: Adb, metro: Metro): Promise<boolean> {
    const controls = async () => /clickable="true"/.test(await adb.dump().catch(() => ''));
    let waited = 0;
    for (; waited < OPEN_MS && !metro.served(); waited += 1000) await this.sleep(1000);
    if (!metro.served()) return false;
    for (let cleared = 0; cleared < CLEAR_MS && (await controls()); cleared += 500)
      await this.sleep(500);
    for (; waited < OPEN_MS; waited += 1000) {
      if (await controls()) return true;
      await this.sleep(1000);
    }
    return false;
  }

  /** Every cleanup step runs even when an earlier one fails. */
  private async back(): Promise<void> {
    const was = this.current;
    this.current = undefined;
    if (was) {
      await was.adb.open(this.url(this.deps.livePort)).catch(() => false);
      await was.adb.unreverse(was.port).catch(() => false);
      try {
        was.metro.stop();
      } catch {
        // Already gone.
      }
      this.deps.releasePort(was.port);
    }
    if (this.showing.kind !== 'live') this.set({ kind: 'live' });
  }

  private set(showing: PhoneShowing): void {
    this.showing = showing;
    this.onChange(showing);
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/**
 * When the phone switches, from the run's state before and after a batch of events: a new run
 * gets the live app; fixes applied and checked, with the agent waiting on the owner (or the run
 * done), get the fixed version, once per branch. Null: no change.
 */
export function phoneFor(
  prev: RunState | undefined,
  next: RunState,
): { kind: 'live' } | { kind: 'fixed'; branch: string } | null {
  if (prev && prev.runId !== next.runId) return { kind: 'live' };
  const branch = (s: RunState) =>
    s.changes.find((c) => c.status === 'verified' && c.branch)?.branch;
  const settled = (s: RunState) =>
    s.fixingCount === 0 && (s.phase === 'done' || s.activity === 'waiting-on-user');
  const now = settled(next) ? branch(next) : undefined;
  const before = prev && settled(prev) ? branch(prev) : undefined;
  return now && now !== before ? { kind: 'fixed', branch: now } : null;
}
