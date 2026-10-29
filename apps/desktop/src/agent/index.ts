// The agent: an Electron utility process (SPEC-phase2 §1). It owns the orchestrator and never
// holds privileged handles; main relays engine calls in and run events out.
//
// P1 stub: the scripted MockRunEngine plays the runs, and every state change is turned into
// events with the shared `diff`, so main, the log and the renderer all run on events. Later
// milestones replace the scripted engine with the real orchestrator behind this same protocol.
import {
  diff,
  ENGINE_METHODS,
  STUB_ENGINE_METHODS,
  type Brief,
  type EngineCall,
  type KeyName,
  type RunState,
} from '@fitts/schema';
import { testKey } from './llm/test-key';
import { profileFor } from '../renderer/mock/profiles';
import { MockRunEngine } from '../renderer/state/mock-engine';
import type { AgentMessage, MainMessage } from './protocol';

const port = process.parentPort;
const briefs = new Map<string, Brief>();
/** API keys from main; later milestones' LLM client reads them from here. */
export const keys: Partial<Record<KeyName, string>> = {};
const engine = new MockRunEngine({ profileFor, briefFor: (id) => briefs.get(id) ?? {} });
const last = new Map<string, RunState>();
const seqs = new Map<string, number>();

const send = (message: AgentMessage) => port.postMessage(message);

engine.subscribeAll((projectId, state) => {
  const events = diff(last.get(projectId), state);
  last.set(projectId, state);
  if (events.length === 0) return;
  const seq = (seqs.get(projectId) ?? 0) + 1;
  seqs.set(projectId, seq);
  send({ kind: 'events', batch: { projectId, runId: state.runId, seq, events } });
});

const allowed = new Set<string>([...ENGINE_METHODS, ...STUB_ENGINE_METHODS]);

function call({ projectId, method, args, brief }: EngineCall): void {
  if (!allowed.has(method)) throw new Error(`unknown engine method: ${method}`);
  if (brief) briefs.set(projectId, brief);
  if (method === 'setSpeed') {
    const speed = args[0];
    if (speed === 1 || speed === 2 || speed === 4) engine.setSpeed(speed);
    return;
  }
  const fn = (engine as unknown as Record<string, (...a: unknown[]) => void>)[method];
  fn?.call(engine, projectId, ...args);
}

port.on('message', (e: { data: MainMessage }) => {
  const message = e.data;
  try {
    if (message.kind === 'call') call(message.call);
    else if (message.kind === 'keys') {
      for (const k of Object.keys(keys) as KeyName[]) delete keys[k];
      Object.assign(keys, message.keys);
    } else if (message.kind === 'testKey') {
      void testKey(message.name, message.value).then((r) =>
        send({ kind: 'keyResult', id: message.id, ...r }),
      );
    }
  } catch (err) {
    send({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});

send({ kind: 'ready' });
