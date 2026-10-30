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
import { ExplorerBrain, SparkBrain, type Brain } from './crawler/brain';
import { RealRun } from './orchestrator/run';
import type { AgentMessage, MainMessage } from './protocol';
import { SiteRpc } from './site-client';

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

/** Live sites main reported (url when running), and the real runs on them (P4). */
const liveSites = new Map<string, { status: string; url?: string }>();
const realRuns = new Map<string, RealRun>();
const siteRpc = new SiteRpc(send);

/** The engine's own states, and what was last sent (with ledger cost), per project. */
const raw = new Map<string, RunState>();
const sent = new Map<string, RunState>();
const seqs = new Map<string, number>();

function emit(projectId: string, extra: RunEvent[] = []): void {
  // A project on the real engine sends its own events (RealRun).
  if (realRuns.has(projectId)) return;
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

/** Starts the real audit on a live project, carrying the interview's state over (§6.1). */
function startRealAudit(projectId: string, set: EngineCall['settings']): boolean {
  const site = liveSites.get(projectId);
  const from = raw.get(projectId);
  if (site?.status !== 'running' || !site.url || !from) return false;
  realRuns.get(projectId)?.dispose();
  const origin = new URL(site.url).origin;
  const runRef: { current?: RealRun } = {};
  const contributor = contributorFor(projectId, set?.contributorMode ?? false);
  const runCaller = new LlmCaller(
    (provider: Provider) => {
      if (provider === 'meta' && keys.meta) return metaClient(keys.meta);
      if (provider === 'baseten' && keys.baseten) return basetenClient(keys.baseten);
      return undefined;
    },
    ledger,
    { onTrouble: () => runRef.current?.apiTrouble() },
  );
  const useModel =
    Boolean(keys.meta) &&
    process.env['FITTS_OFFLINE'] !== '1' &&
    process.env['FITTS_CRAWL_BRAIN'] !== 'explorer';
  const brain: Brain = useModel
    ? new SparkBrain(
        runCaller,
        () => ({
          runId: from.runId,
          projectId,
          contributor,
          allowed: () => runRef.current?.allowed() ?? true,
        }),
        () =>
          modelFor('crawl', profiles.get(projectId) ?? set?.modelProfile ?? 'quality', {
            contributor,
            baseten: Boolean(keys.baseten),
          }).model,
      )
    : new ExplorerBrain();
  let seq = seqs.get(projectId) ?? 0;
  const capUsd = set?.capUsd ?? from.cost.capUsd;
  const run = new RealRun(
    { ...from, cost: { ...from.cost, capUsd } },
    {
      site: siteRpc.for(projectId),
      brain,
      ledger,
      budget,
      origin,
      emit: (events) => {
        seq += 1;
        seqs.set(projectId, seq);
        send({ kind: 'events', batch: { projectId, runId: from.runId, seq, events } });
      },
      onEconomy: () => profiles.set(projectId, 'economy'),
    },
  );
  runRef.current = run;
  realRuns.set(projectId, run);
  run.start();
  return true;
}

/** RunEngine calls for a project on the real engine. Returns false for the stub to handle. */
function callReal(projectId: string, method: string, args: unknown[]): boolean {
  const run = realRuns.get(projectId);
  if (!run) return false;
  switch (method) {
    case 'pause':
      run.pause();
      return true;
    case 'resume':
      run.resume();
      return true;
    case 'stopAction':
      run.stopAction();
      return true;
    case 'stopRun':
      run.stopRun();
      return true;
    case 'takeWheel':
      run.takeWheel();
      return true;
    case 'handBack':
      run.handBack();
      return true;
    case 'recordUserClick':
      run.recordUserClick(typeof args[0] === 'string' ? args[0] : '');
      return true;
    case 'sendMessage':
      run.sendMessage(
        typeof args[0] === 'string' ? args[0] : '',
        args[1] as { pointingAt?: string; spoken?: boolean },
      );
      return true;
    case 'interruptNow':
      run.interruptNow();
      return true;
    case 'answerQuestion':
      run.answer(String(args[0]), String(args[1]));
      return true;
    case 'setMode':
      run.setMode(args[0] as Parameters<RealRun['setMode']>[0]);
      return true;
    case 'rewindTo':
      run.rewindTo(typeof args[0] === 'number' ? args[0] : null);
      return true;
    case 'updateBrief':
      run.updateBrief(args[0] as Brief);
      return true;
    case 'startInterview':
    case 'startAudit':
      // A new interview (New run) leaves the real run; the stub plays the interview again.
      run.dispose();
      realRuns.delete(projectId);
      return false;
    default:
      // Findings, fixes and redesign arrive in later milestones.
      return true;
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
  if (callReal(projectId, method, args)) return;
  if (method === 'startAudit' && startRealAudit(projectId, set)) return;
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
    } else if (message.kind === 'siteStatus') {
      const { projectId, status, url } = message.status;
      liveSites.set(projectId, { status, ...(url ? { url } : {}) });
      if (status === 'failed') realRuns.get(projectId)?.siteDown();
    } else if (message.kind === 'siteResult') {
      siteRpc.resolve(
        message.id,
        message.ok,
        message.ok ? message.result : undefined,
        message.ok ? undefined : message.error,
      );
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
