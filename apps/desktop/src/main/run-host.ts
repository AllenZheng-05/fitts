// Main's side of the engine (SPEC-phase2 §1, §12.1): starts the agent utility process, relays
// validated engine calls to it, appends its events to the run log, keeps each run's state
// with the shared reducer, and forwards events to the app window.
import {
  ENGINE_METHODS,
  IPC,
  STUB_ENGINE_METHODS,
  reduce,
  type AppModel,
  type AppModelPatch,
  type EngineCall,
  type EngineEvents,
  type KeyName,
  type RunState,
  type SiteStatus,
} from '@fitts/schema';
import { app, BrowserWindow, ipcMain, utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import type {
  AgentMessage,
  HeldRequest,
  MainMessage,
  SiteOp,
  SiteOpResult,
  UnderstandAsk,
} from '../agent/protocol';
import { devRepoRoot } from './dev-root';
import type { Secrets } from './secrets';
import { RunLog, runDir, SAFE_ID } from './store/run-log';

const METHODS = new Set<string>([...ENGINE_METHODS, ...STUB_ENGINE_METHODS]);

function isEngineCall(v: unknown): v is EngineCall {
  const c = v as Partial<EngineCall> | null;
  return (
    !!c &&
    typeof c.projectId === 'string' &&
    SAFE_ID.test(c.projectId) &&
    typeof c.method === 'string' &&
    METHODS.has(c.method) &&
    Array.isArray(c.args)
  );
}

export class RunHost {
  private child: UtilityProcess | undefined;
  private ready = false;
  private queue: MainMessage[] = [];
  private readonly states = new Map<string, RunState>();
  private readonly logs = new Map<string, RunLog>();
  private quitting = false;
  private nextRequest = 1;
  /** Runs a crawler operation on a project's site window (SiteManager.run). */
  siteOps: ((projectId: string, op: SiteOp) => Promise<SiteOpResult>) | undefined;

  /** Tells the agent a project's live site changed (running, failed, …). */
  siteStatus(status: SiteStatus): void {
    this.send({ kind: 'siteStatus', status });
  }

  /** A write from Fitts's action, held for the gate (§13). */
  siteHeld(projectId: string, held: HeldRequest): void {
    this.send({ kind: 'siteHeld', projectId, held });
  }

  /** SPEC-phase4 §3: asks the agent to understand a project. */
  understand(ask: UnderstandAsk): void {
    this.send({ kind: 'understand', ask });
  }

  /** The agent built an App Model, or the owner corrected one (main stores both). */
  onAppModel:
    | ((
        projectId: string,
        model: AppModel,
        hashes: Record<string, string>,
        modeled: boolean,
      ) => void)
    | undefined;
  onAppModelPatch: ((projectId: string, patches: AppModelPatch[]) => void) | undefined;

  /** Speech in and out, for the cost ledger (§11). */
  voiceUsage(
    projectId: string,
    usage: { task: 'stt'; seconds: number } | { task: 'tts'; chars: number },
  ): void {
    if (projectId) this.send({ kind: 'voiceUsage', projectId, usage });
  }

  /** Called when a run starts a new step (main saves a step shot for rewind). */
  onStep: ((projectId: string, runId: string, step: number) => void) | undefined;
  private readonly pending = new Map<number, (r: { ok: boolean; message: string }) => void>();

  constructor(
    private readonly secrets: Secrets,
    private readonly root = app.getPath('userData'),
  ) {}

  /** Sends the current keys to the agent (after a change, and on every agent start). */
  pushKeys(): void {
    this.send({ kind: 'keys', keys: this.secrets.all() });
  }

  testKey(name: KeyName, value: string): Promise<{ ok: boolean; message: string }> {
    const id = this.nextRequest++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.send({ kind: 'testKey', id, name, value });
    });
  }

  /** A live-site ownership check, run by the agent's verify-site module (§4.2). */
  verifySite(
    method: 'dns' | 'file',
    domain: string,
    token: string,
  ): Promise<{ ok: boolean; message: string }> {
    const id = this.nextRequest++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.send({ kind: 'verifySite', id, method, domain, token });
    });
  }

  start(): void {
    ipcMain.on(IPC.engineCall, (_e, call: unknown) => {
      if (isEngineCall(call)) this.send({ kind: 'call', call });
    });
    ipcMain.handle(IPC.engineStates, () => Object.fromEntries(this.states));
    app.on('before-quit', () => {
      this.quitting = true;
      this.child?.kill();
    });
    this.spawn();
    this.pushKeys();
  }

  private spawn(): void {
    const env = { ...process.env };
    delete env['ELECTRON_RUN_AS_NODE'];
    // Dev builds (not e2e) log real spend next to the session's .fitts-dev/spend.json.
    const root = devRepoRoot();
    if (root && process.env['FITTS_NO_DEV_KEYS'] !== '1')
      env['FITTS_DEV_SPEND_FILE'] = join(root, '.fitts-dev', 'agent-spend.ndjson');
    this.ready = false;
    const child = utilityProcess.fork(join(__dirname, 'agent.js'), [], {
      serviceName: 'Fitts agent',
      env,
      stdio: 'inherit',
    });
    this.child = child;
    child.on('message', (m: AgentMessage) => this.onMessage(m));
    child.on('exit', (code) => {
      if (this.child !== child || this.quitting) return;
      console.error(`[fitts] agent exited (${code}); restarting`);
      setTimeout(() => {
        this.spawn();
        this.pushKeys();
      }, 500);
    });
  }

  private send(message: MainMessage): void {
    if (this.ready && this.child) this.child.postMessage(message);
    else this.queue.push(message);
  }

  private onMessage(m: AgentMessage): void {
    switch (m.kind) {
      case 'ready':
        this.ready = true;
        for (const q of this.queue.splice(0)) this.child?.postMessage(q);
        return;
      case 'error':
        console.error('[fitts] agent:', m.message);
        return;
      case 'events':
        this.onEvents(m.batch);
        return;
      case 'site': {
        const { id, projectId, request } = m;
        const run = this.siteOps;
        if (!run || !SAFE_ID.test(projectId)) {
          this.send({ kind: 'siteResult', id, ok: false, error: 'No site' });
          return;
        }
        run(projectId, request).then(
          (result) => this.send({ kind: 'siteResult', id, ok: true, result }),
          (e: unknown) =>
            this.send({
              kind: 'siteResult',
              id,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            }),
        );
        return;
      }
      case 'keyResult':
      case 'verifyResult':
        this.pending.get(m.id)?.({ ok: m.ok, message: m.message });
        this.pending.delete(m.id);
        return;
      case 'appModel':
        if (SAFE_ID.test(m.projectId)) this.onAppModel?.(m.projectId, m.model, m.hashes, m.modeled);
        return;
      case 'appModelPatch':
        if (SAFE_ID.test(m.projectId)) this.onAppModelPatch?.(m.projectId, m.patches);
        return;
    }
  }

  private onEvents(batch: EngineEvents): void {
    const { projectId, runId, events } = batch;
    if (!SAFE_ID.test(projectId) || !SAFE_ID.test(runId)) return;
    let state = this.states.get(projectId);
    for (const event of events) state = reduce(state, event);
    if (state) this.states.set(projectId, state);

    const key = `${projectId}/${runId}`;
    let log = this.logs.get(key);
    if (!log) {
      log = new RunLog(runDir(this.root, projectId, runId), projectId, runId);
      this.logs.set(key, log);
    }
    log.append(events, state);
    for (const e of events) if (e.type === 'step.started') this.onStep?.(projectId, runId, e.step);

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.webContents.isDestroyed()) win.webContents.send(IPC.engineEvents, batch);
    }
  }
}
