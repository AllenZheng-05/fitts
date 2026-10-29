// Main's side of the engine (SPEC-phase2 §1, §12.1): starts the agent utility process, relays
// validated engine calls to it, appends its events to the run log, keeps each run's state
// with the shared reducer, and forwards events to the app window.
import {
  ENGINE_METHODS,
  IPC,
  STUB_ENGINE_METHODS,
  reduce,
  type EngineCall,
  type EngineEvents,
  type KeyName,
  type RunState,
} from '@fitts/schema';
import { app, BrowserWindow, ipcMain, utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import type { AgentMessage, MainMessage } from '../agent/protocol';
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
      case 'keyResult':
        this.pending.get(m.id)?.({ ok: m.ok, message: m.message });
        this.pending.delete(m.id);
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

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.webContents.isDestroyed()) win.webContents.send(IPC.engineEvents, batch);
    }
  }
}
