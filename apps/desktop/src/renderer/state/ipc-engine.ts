// The real engine's renderer side (SPEC-phase2 §12.1): RunEngine over IPC. State comes from
// the same reducer main and the agent use, fed by the agent's event batches; method calls go to
// the agent through main.
import {
  reduce,
  type Brief,
  type EngineBridge,
  type EngineEvents,
  type EngineMethod,
  type StubEngineMethod,
  type Mode,
  type RunEngine,
  type RunState,
} from '@fitts/schema';

type Listener = (s: RunState) => void;

/** Project id for calls that aren't about one project. */
const STUB_PROJECT = 'all';
type AllListener = (projectId: string, s: RunState) => void;

export class IpcRunEngine implements RunEngine {
  private readonly states = new Map<string, RunState>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly allListeners = new Set<AllListener>();

  constructor(
    private readonly bridge: EngineBridge,
    private readonly briefFor: (projectId: string) => Brief | undefined = () => undefined,
  ) {
    bridge.onEvents((batch) => this.apply(batch));
    // A renderer that reloads mid-run picks up every run main already knows.
    void bridge.states().then((all) => {
      for (const [projectId, state] of Object.entries(all)) {
        if (!this.states.has(projectId)) this.set(projectId, state);
      }
    });
  }

  private apply({ projectId, events }: EngineEvents): void {
    const before = this.states.get(projectId);
    let state = before;
    for (const event of events) state = reduce(state, event);
    if (state && state !== before) this.set(projectId, state);
  }

  private set(projectId: string, state: RunState): void {
    this.states.set(projectId, state);
    for (const l of this.listeners.get(projectId) ?? []) l(state);
    for (const l of this.allListeners) l(projectId, state);
  }

  private call(
    projectId: string,
    method: EngineMethod | StubEngineMethod,
    ...args: unknown[]
  ): void {
    const brief = this.briefFor(projectId);
    this.bridge.call({ projectId, method, args, ...(brief ? { brief } : {}) });
  }

  getState(projectId: string): RunState | undefined {
    return this.states.get(projectId);
  }

  subscribe(projectId: string, fn: Listener): () => void {
    let set = this.listeners.get(projectId);
    if (!set) {
      set = new Set();
      this.listeners.set(projectId, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  subscribeAll(fn: AllListener): () => void {
    this.allListeners.add(fn);
    return () => this.allListeners.delete(fn);
  }

  startInterview(projectId: string) {
    this.call(projectId, 'startInterview');
  }
  answerInterview(projectId: string, text: string) {
    this.call(projectId, 'answerInterview', text);
  }
  startAudit(projectId: string) {
    this.call(projectId, 'startAudit');
  }
  pause(projectId: string) {
    this.call(projectId, 'pause');
  }
  resume(projectId: string) {
    this.call(projectId, 'resume');
  }
  stopAction(projectId: string) {
    this.call(projectId, 'stopAction');
  }
  stopRun(projectId: string) {
    this.call(projectId, 'stopRun');
  }
  takeWheel(projectId: string) {
    this.call(projectId, 'takeWheel');
  }
  handBack(projectId: string) {
    this.call(projectId, 'handBack');
  }
  sendMessage(projectId: string, text: string, opts?: { pointingAt?: string; spoken?: boolean }) {
    this.call(projectId, 'sendMessage', text, ...(opts ? [opts] : []));
  }
  interruptNow(projectId: string) {
    this.call(projectId, 'interruptNow');
  }
  answerQuestion(projectId: string, itemId: string, answer: string) {
    this.call(projectId, 'answerQuestion', itemId, answer);
  }
  approveFixes(projectId: string, findingIds: string[]) {
    this.call(projectId, 'approveFixes', findingIds);
  }
  dismissFinding(projectId: string, findingId: string) {
    this.call(projectId, 'dismissFinding', findingId);
  }
  respondGate(projectId: string, gateId: string, decision: 'deny' | 'other' | 'allow') {
    this.call(projectId, 'respondGate', gateId, decision);
  }
  setMode(projectId: string, mode: Mode) {
    this.call(projectId, 'setMode', mode);
  }
  pickDirection(projectId: string, directionId: string) {
    this.call(projectId, 'pickDirection', directionId);
  }
  decideWording(projectId: string, itemId: string, decision: 'keep' | 'undo') {
    this.call(projectId, 'decideWording', itemId, decision);
  }
  undoChange(projectId: string, changeId: string) {
    this.call(projectId, 'undoChange', changeId);
  }
  retryChange(projectId: string, changeId: string) {
    this.call(projectId, 'retryChange', changeId);
  }
  rewindTo(projectId: string, stepIndex: number | null) {
    this.call(projectId, 'rewindTo', stepIndex);
  }
  updateBrief(projectId: string, brief: Brief) {
    this.call(projectId, 'updateBrief', brief);
  }

  /** Dev only (Scenario panel): the P1 stub agent's playback speed. */
  setStubSpeed(speed: 1 | 2 | 4) {
    this.call(STUB_PROJECT, 'setSpeed', speed);
  }

  /** Stub-only (P1): "You clicked …" while driving; P2 records clicks in main. */
  recordUserClick(projectId: string, label: string) {
    this.call(projectId, 'recordUserClick', label);
  }
}
