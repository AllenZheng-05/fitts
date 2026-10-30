// Replay mode (SPEC-phase2 §12.3): plays a recorded run's events through the shared reducer at
// recorded timing, 1× or 4×, with no keys and no agent. Long idle gaps are shortened so the run
// keeps moving. Engine methods are no-ops, except stopping, which jumps to the end.
import { reduce, type RunEngine, type RunEvent, type RunState } from '@fitts/schema';

type Listener = (s: RunState) => void;
type AllListener = (projectId: string, s: RunState) => void;

/** A pause in the recording longer than this plays as this (ms, before speed-up). */
const MAX_GAP_MS = 3000;

export class ReplayRunEngine implements RunEngine {
  private readonly states = new Map<string, RunState>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly allListeners = new Set<AllListener>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue: { ts: number; event: RunEvent }[] = [];
  private projectId = '';
  speed: 1 | 4 = 4;

  /** Starts playing a recording from its first event. */
  play(projectId: string, events: { ts: number; event: RunEvent }[], speed: 1 | 4 = 4): void {
    this.stopTimer();
    this.projectId = projectId;
    this.speed = speed;
    this.queue = [...events];
    this.states.delete(projectId);
    this.next();
  }

  get playing(): boolean {
    return this.queue.length > 0;
  }

  private next(): void {
    const item = this.queue.shift();
    if (!item) return;
    this.apply(item.event);
    const following = this.queue[0];
    if (!following) return;
    const gap = Math.min(MAX_GAP_MS, Math.max(0, following.ts - item.ts));
    this.timer = setTimeout(() => this.next(), gap / this.speed);
  }

  private apply(event: RunEvent): void {
    const state = reduce(this.states.get(this.projectId), event);
    if (!state) return;
    this.states.set(this.projectId, state);
    for (const l of this.listeners.get(this.projectId) ?? []) l(state);
    for (const l of this.allListeners) l(this.projectId, state);
  }

  private stopTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Jumps to the end of the recording. */
  finish(): void {
    this.stopTimer();
    const rest = this.queue;
    this.queue = [];
    let state = this.states.get(this.projectId);
    for (const { event } of rest) state = reduce(state, event) ?? state;
    if (state) {
      this.states.set(this.projectId, state);
      for (const l of this.listeners.get(this.projectId) ?? []) l(state);
      for (const l of this.allListeners) l(this.projectId, state);
    }
  }

  getState(projectId: string): RunState | undefined {
    return this.states.get(projectId);
  }

  subscribe(projectId: string, fn: Listener): () => void {
    const set = this.listeners.get(projectId) ?? new Set<Listener>();
    set.add(fn);
    this.listeners.set(projectId, set);
    return () => set.delete(fn);
  }

  subscribeAll(fn: AllListener): () => void {
    this.allListeners.add(fn);
    return () => this.allListeners.delete(fn);
  }

  // Watching only: every action is a no-op, except stopping, which ends playback.
  stopRun(): void {
    this.finish();
  }
  stopAction(): void {
    this.finish();
  }
  startInterview(): void {}
  answerInterview(): void {}
  startAudit(): void {}
  pause(): void {}
  resume(): void {}
  takeWheel(): void {}
  handBack(): void {}
  sendMessage(): void {}
  interruptNow(): void {}
  answerQuestion(): void {}
  approveFixes(): void {}
  dismissFinding(): void {}
  respondGate(): void {}
  setMode(): void {}
  pickDirection(): void {}
  decideWording(): void {}
  undoChange(): void {}
  retryChange(): void {}
  rewindTo(): void {}
  updateBrief(): void {}
}
