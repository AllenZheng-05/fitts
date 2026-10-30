// The agent: an Electron utility process (SPEC-phase2 §1). It owns the orchestrator and never
// holds privileged handles; main relays engine calls in and run events out.
//
// Stub (P1–P3): the scripted MockRunEngine plays the runs, and every state change is turned
// into events with the shared `diff`. Real model calls (P3) go through LlmCaller into the cost
// ledger; a run's cost is its scripted spend plus its ledger, and the budget guard posts the
// 80% and 100% cards from that. Later milestones replace the scripted engine behind this same
// message protocol.
import {
  diff,
  ENGINE_METHODS,
  STUB_ENGINE_METHODS,
  type Brief,
  type EngineCall,
  type KeyName,
  type RunEvent,
  type RunState,
} from '@fitts/schema';
import { appendFileSync } from 'node:fs';
import { profileFor } from '../renderer/mock/profiles';
import { MockRunEngine } from '../renderer/state/mock-engine';
import { BudgetGuard } from './ledger/budget';
import { CostLedger, withLedger } from './ledger/ledger';
import { basetenClient, LlmCaller, metaClient, type Provider } from './llm/call';
import { contributorFor, modelFor, SPARK_OPEN, type Profile } from './llm/router';
import { testKey } from './llm/test-key';
import type { AgentMessage, MainMessage } from './protocol';

const port = process.parentPort;
const send = (message: AgentMessage) => port.postMessage(message);

const briefs = new Map<string, Brief>();
const settings = new Map<string, NonNullable<EngineCall['settings']>>();
/** Profile per project; "Switch to Economy" on the 80% card changes it (§2). */
const profiles = new Map<string, Profile>();
/** API keys from main (safeStorage, or .env.local in dev builds). */
export const keys: Partial<Record<KeyName, string>> = {};

const engine = new MockRunEngine({ profileFor, briefFor: (id) => briefs.get(id) ?? {} });
const ledger = new CostLedger();
const budget = new BudgetGuard();
const caller = new LlmCaller((provider: Provider) => {
  if (provider === 'meta' && keys.meta) return metaClient(keys.meta);
  if (provider === 'baseten' && keys.baseten) return basetenClient(keys.baseten);
  return undefined;
}, ledger);

/** The engine's own states, and what was last sent (with ledger cost), per project. */
const raw = new Map<string, RunState>();
const sent = new Map<string, RunState>();
const seqs = new Map<string, number>();

function emit(projectId: string, extra: RunEvent[] = []): void {
  const state = raw.get(projectId);
  if (!state) return;
  const shown: RunState = { ...state, cost: withLedger(state.cost, ledger.totals(state.runId)) };
  const events = [...extra, ...diff(sent.get(projectId), shown)];
  sent.set(projectId, shown);
  if (events.length === 0) return;
  const seq = (seqs.get(projectId) ?? 0) + 1;
  seqs.set(projectId, seq);
  send({ kind: 'events', batch: { projectId, runId: state.runId, seq, events } });
  checkBudget(projectId, shown);
}

/** 80% → budget-warning (once); 100% → budget (pauses). Posted outside the engine callback. */
function checkBudget(projectId: string, s: RunState): void {
  if (s.phase !== 'audit') return;
  const action = budget.check(s.runId, s.cost.spentUsd, s.cost.capUsd);
  if (action)
    setTimeout(
      () => engine.showEdgeState(projectId, action === 'warn' ? 'budget-warning' : 'budget'),
      0,
    );
}

engine.subscribeAll((projectId, state) => {
  raw.set(projectId, state);
  emit(projectId);
});

ledger.onEntry((entry) => {
  emit(entry.projectId, [{ type: 'ledger.entry', entry }]);
  const file = process.env['FITTS_DEV_SPEND_FILE'];
  if (file) {
    // Dev builds only: the session's spend log, next to .fitts-dev/spend.json.
    appendFileSync(
      file,
      JSON.stringify({ ts: entry.ts, usd: entry.usd, model: entry.model, task: entry.task }) + '\n',
    );
  }
});

/** Dev only (Scenario panel): one real call per provider on the project's run (P3 check). */
async function llmPing(projectId: string): Promise<void> {
  const s = raw.get(projectId);
  if (!s) return;
  const set = settings.get(projectId);
  const contributor = contributorFor(projectId, set?.contributorMode ?? false);
  const profile = profiles.get(projectId) ?? set?.modelProfile ?? 'quality';
  const ctx = {
    runId: s.runId,
    projectId,
    contributor,
    allowed: () => {
      const now = sent.get(projectId);
      return !now || budget.allowed(now.cost.spentUsd, now.cost.capUsd);
    },
  };
  const opts = { contributor, baseten: Boolean(keys.baseten) };
  const jobs = [
    { task: 'interview' as const, ...modelFor('chat', profile, opts) },
    { task: 'aggregate' as const, ...modelFor('aggregate', 'quality', opts) },
    ...(keys.baseten
      ? [{ task: 'review' as const, provider: 'baseten' as const, model: SPARK_OPEN }]
      : []),
  ];
  for (const job of jobs) {
    await caller.call(ctx, {
      task: job.task,
      model: job.model,
      provider: job.provider,
      input: 'Reply with one short sentence: what makes a Send button easy to find?',
      reasoning: { effort: 'minimal' },
    });
  }
}

const allowed = new Set<string>([...ENGINE_METHODS, ...STUB_ENGINE_METHODS]);

function call({ projectId, method, args, brief, settings: set }: EngineCall): void {
  if (!allowed.has(method)) throw new Error(`unknown engine method: ${method}`);
  if (brief) briefs.set(projectId, brief);
  if (set) settings.set(projectId, set);
  if (method === 'setSpeed') {
    const speed = args[0];
    if (speed === 1 || speed === 2 || speed === 4) engine.setSpeed(speed);
    return;
  }
  if (method === 'llmPing') {
    void llmPing(projectId).catch((e: unknown) =>
      send({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return;
  }
  if (method === 'answerQuestion') {
    const item = raw.get(projectId)?.chat.find((c) => c.id === args[0]);
    if (item?.type === 'state' && item.stateKind === 'budget-warning' && args[1] === 'economy')
      profiles.set(projectId, 'economy');
  }
  const fn = (engine as unknown as Record<string, (...a: unknown[]) => void>)[method];
  fn?.call(engine, projectId, ...args);
  // A run takes the Settings cap when it starts.
  if ((method === 'startInterview' || method === 'startAudit') && set)
    engine.setCap(projectId, set.capUsd);
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
