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
import { copy } from '../renderer/copy';
import { MockRunEngine } from '../renderer/state/mock-engine';
import { BudgetGuard } from './ledger/budget';
import { CostLedger, withLedger } from './ledger/ledger';
import { basetenClient, LlmCaller, metaClient, type Provider } from './llm/call';
import { contributorFor, modelFor, reviewerRoster, SPARK_OPEN, type Profile } from './llm/router';
import { testKey } from './llm/test-key';
import { recording } from './llm/fake';
import { ExplorerBrain, SparkBrain, type Brain } from './crawler/brain';
import { isLiveOrigin, RealRun } from './orchestrator/run';
import { ReviewerPanel } from './review/reviewers';
import { themeFit } from './review/themefit';
import { briefFromSummary, interviewTurn } from './interview/interview';
import { runFixer } from './fix/fixer';
import { runRedesigner } from './fix/redesign';
import { Media } from './llm/media';
import { voiceEntry } from './llm/voice-cost';
import { domainOf, verifyDns, verifyFile } from './verify-site/verify';
import type { AgentMessage, MainMessage } from './protocol';
import { SiteRpc } from './site-client';

const port = process.parentPort;
const send = (message: AgentMessage) => port.postMessage(message);

const briefs = new Map<string, Brief>();
/** Each project's last run id, from the renderer, so new runs never reuse one. */
const lastRuns = new Map<string, string>();
const settings = new Map<string, NonNullable<EngineCall['settings']>>();
/** Profile per project; "Switch to Economy" on the 80% card changes it (§2). */
const profiles = new Map<string, Profile>();
/** API keys from main (safeStorage, or .env.local in dev builds). */
export const keys: Partial<Record<KeyName, string>> = {};

const engine = new MockRunEngine({
  profileFor,
  briefFor: (id) => briefs.get(id) ?? {},
  lastRunFor: (id) => lastRuns.get(id),
});
const ledger = new CostLedger();
const budget = new BudgetGuard();
/** The model clients for the current keys (recorded as fixtures when FITTS_RECORD_LLM is set). */
function clientFor(provider: Provider) {
  const client =
    provider === 'meta' && keys.meta
      ? metaClient(keys.meta)
      : provider === 'baseten' && keys.baseten
        ? basetenClient(keys.baseten)
        : undefined;
  const dir = process.env['FITTS_RECORD_LLM'];
  return client && dir ? recording(client, dir) : client;
}
const caller = new LlmCaller(clientFor, ledger);

/** Live sites main reported (url when running), and the real runs on them (P4). */
const liveSites = new Map<string, { status: string; url?: string }>();
/** The paths the user clicked through on each live site (the interview's context, §6.2). */
const visited = new Map<string, string[]>();
const online = () => Boolean(keys.meta) && process.env['FITTS_OFFLINE'] !== '1';
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

/** A model call's context for a project's current run. */
function ctxFor(projectId: string) {
  const s = realRuns.get(projectId)?.state ?? raw.get(projectId);
  const set = settings.get(projectId);
  return {
    runId: s?.runId ?? 'run-1',
    projectId,
    contributor: contributorFor(projectId, set?.contributorMode ?? false),
    allowed: () => {
      const now = realRuns.get(projectId)?.state ?? sent.get(projectId);
      return !now || budget.allowed(now.cost.spentUsd, now.cost.capUsd);
    },
  };
}

/** The interview's model for a project's profile. */
function interviewModel(projectId: string): string {
  const set = settings.get(projectId);
  const contributor = contributorFor(projectId, set?.contributorMode ?? false);
  const profile = profiles.get(projectId) ?? set?.modelProfile ?? 'quality';
  return modelFor('interview', profile, { contributor, baseten: Boolean(keys.baseten) }).model;
}

/** The brief paragraph the owner saved differs from the run's (so its fields need re-reading). */
function briefChanged(projectId: string, next: Brief | undefined): boolean {
  const current = (realRuns.get(projectId)?.state ?? raw.get(projectId))?.brief;
  return Boolean(next?.summary?.trim()) && next?.summary !== current?.summary;
}

/** One real interview turn on a live project (§6.2); the scripted step if the model can't. */
async function realInterviewTurn(
  projectId: string,
  text: string,
  opts: { spoken?: boolean; pointingAt?: string; pointingLabel?: string },
): Promise<void> {
  if (!engine.interviewUser(projectId, text, opts)) return;
  const s = raw.get(projectId);
  const site = siteRpc.for(projectId);
  try {
    if (!s) throw new Error('no run');
    const [shot, snap] = await Promise.all([
      site.screenshot().catch(() => undefined),
      site.snapshot().catch(() => undefined),
    ]);
    const set = settings.get(projectId);
    const contributor = contributorFor(projectId, set?.contributorMode ?? false);
    const profile = profiles.get(projectId) ?? set?.modelProfile ?? 'quality';
    const turn = await interviewTurn(
      caller,
      {
        runId: s.runId,
        projectId,
        contributor,
        allowed: () => {
          const now = sent.get(projectId);
          return !now || budget.allowed(now.cost.spentUsd, now.cost.capUsd);
        },
      },
      modelFor('interview', profile, { contributor, baseten: Boolean(keys.baseten) }).model,
      {
        state: raw.get(projectId) ?? s,
        ...(shot ? { shot: shot.jpegBase64 } : {}),
        ...(snap ? { page: { path: snap.path, title: snap.title, headings: snap.headings } } : {}),
        path: visited.get(projectId) ?? [],
        auditOnly: liveSites.get(projectId)?.url
          ? isLiveOrigin(new URL(liveSites.get(projectId)?.url ?? '').origin)
          : false,
      },
    );
    engine.interviewReply(projectId, turn);
  } catch {
    engine.interviewFallback(projectId, text);
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
  const runCaller = new LlmCaller(clientFor, ledger, {
    onTrouble: () => runRef.current?.apiTrouble(),
  });
  const useModel = online() && process.env['FITTS_CRAWL_BRAIN'] !== 'explorer';
  let fixJobs = 0;
  const callCtx = () => ({
    runId: from.runId,
    projectId,
    contributor,
    allowed: () => runRef.current?.allowed() ?? true,
  });
  const profile = () => profiles.get(projectId) ?? set?.modelProfile ?? 'quality';
  const panel = online()
    ? new ReviewerPanel(runCaller, callCtx, () =>
        reviewerRoster(profile(), { contributor, baseten: Boolean(keys.baseten) }),
      )
    : undefined;
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
      ...(panel ? { panel } : {}),
      ...(online() && keys.meta && process.env['FITTS_NO_MEDIA'] !== '1'
        ? { media: new Media(keys.meta, ledger) }
        : {}),
      // A live site has no code: no fixer or redesigner, so nothing is offered that can't be done.
      ...(online() && !isLiveOrigin(origin)
        ? {
            fixer: (
              task: string,
              tools: Parameters<typeof runFixer>[4],
              opts: Parameters<typeof runFixer>[5],
            ) => {
              // Dev and tests only (P9's rollback check): the Nth fix job makes no change.
              fixJobs += 1;
              if (Number(process.env['FITTS_SABOTAGE_FIX'] ?? '0') === fixJobs)
                return Promise.resolve({
                  patched: 0,
                  summary: 'deliberately skipped (rollback check)',
                });
              return runFixer(
                runCaller,
                callCtx(),
                modelFor('fix', profile(), { contributor, baseten: Boolean(keys.baseten) }).model,
                task,
                tools,
                opts,
              );
            },
            redesigner: (
              task: string,
              tools: Parameters<typeof runRedesigner>[4],
              opts: Parameters<typeof runRedesigner>[5],
            ) =>
              runRedesigner(
                runCaller,
                callCtx(),
                modelFor('fix', profile(), { contributor, baseten: Boolean(keys.baseten) }).model,
                task,
                tools,
                opts,
              ),
          }
        : {}),
      ...(online()
        ? {
            themeFit: (input: Parameters<typeof themeFit>[3], signal?: AbortSignal) =>
              themeFit(
                runCaller,
                callCtx(),
                modelFor('themefit', profile(), { contributor, baseten: Boolean(keys.baseten) })
                  .model,
                input,
                signal,
              ),
          }
        : {}),
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
        args[1] as { pointingAt?: string; pointingLabel?: string; spoken?: boolean },
      );
      return true;
    case 'interruptNow':
      run.interruptNow();
      return true;
    case 'answerQuestion':
      run.answer(String(args[0]), String(args[1]));
      return true;
    case 'approveFixes':
      run.approveFixes(Array.isArray(args[0]) ? (args[0] as string[]) : []);
      return true;
    case 'dismissFinding':
      run.dismissFinding(String(args[0]));
      return true;
    case 'reopenFinding':
      run.reopenFinding(String(args[0]));
      return true;
    case 'showFinding':
      void run.showFinding(String(args[0]));
      return true;
    case 'retryChange':
      run.retryChange(
        String(args[0]),
        typeof args[1] === 'string' ? args[1].trim().slice(0, 500) : undefined,
      );
      return true;
    case 'undoChange':
      run.undoChange(String(args[0]));
      return true;
    case 'respondGate':
      run.respondGate(String(args[0]), args[1] as 'deny' | 'other' | 'allow');
      return true;
    case 'pickDirection':
      run.pickDirection(String(args[0]));
      return true;
    case 'decideWording':
      run.decideWording(String(args[0]), args[1] === 'undo' ? 'undo' : 'keep');
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
    case 'startInterview': {
      // New run: the real run ends and the next one starts, with the brief kept, on the next
      // run number. Fitts asks what this run is for, not what the site is.
      const last = run.state;
      run.dispose();
      realRuns.delete(projectId);
      engine.startNextRun(projectId, last, copy.fitts.interviewNextRun, [
        ...copy.fitts.interviewNextRunReplies,
      ]);
      return true;
    }
    case 'startAudit':
      run.dispose();
      realRuns.delete(projectId);
      return false;
    default:
      return true;
  }
}

const allowed = new Set<string>([...ENGINE_METHODS, ...STUB_ENGINE_METHODS]);

function call({ projectId, method, args, brief, lastRunId, settings: set }: EngineCall): void {
  if (!allowed.has(method)) throw new Error(`unknown engine method: ${method}`);
  if (brief) briefs.set(projectId, brief);
  if (lastRunId) lastRuns.set(projectId, lastRunId);
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
  // The owner edited their brief (one paragraph): the fields are re-read from it first.
  if (method === 'updateBrief' && online() && briefChanged(projectId, args[0] as Brief)) {
    const next = args[0] as Brief;
    void briefFromSummary(caller, ctxFor(projectId), interviewModel(projectId), next.summary ?? '')
      .catch(() => next)
      .then((brief) => {
        if (!callReal(projectId, 'updateBrief', [brief])) engine.updateBrief(projectId, brief);
      });
    return;
  }
  if (callReal(projectId, method, args)) return;
  // The real interview, with a key: a conversation with the model, whether or not the site is
  // up yet (the stub keeps the interview's state: the opener, the brief card, the ready bar).
  // A message sent while pointing at something is still an interview answer, with the element.
  const answering = method === 'answerInterview' || method === 'sendMessage';
  if (answering && raw.get(projectId)?.phase === 'interview' && online()) {
    const o = (args[1] ?? {}) as { spoken?: boolean; pointingAt?: string; pointingLabel?: string };
    void realInterviewTurn(projectId, typeof args[0] === 'string' ? args[0] : '', {
      ...(o.spoken ? { spoken: true } : {}),
      ...(typeof o.pointingAt === 'string' ? { pointingAt: o.pointingAt } : {}),
      ...(typeof o.pointingLabel === 'string'
        ? { pointingLabel: o.pointingLabel.slice(0, 80) }
        : {}),
    });
    return;
  }
  if (method === 'startAudit' && startRealAudit(projectId, set)) return;
  // A real run never falls back to Phase 1's scripted audit: it waits for the site.
  if (method === 'startAudit' && online()) {
    engine.note(projectId, copy.fitts.siteNotReady);
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
    } else if (message.kind === 'siteStatus') {
      const { projectId, status, url, log } = message.status;
      liveSites.set(projectId, { status, ...(url ? { url } : {}) });
      if (url) {
        const path = new URL(url).pathname;
        const list = visited.get(projectId) ?? [];
        if (list.at(-1) !== path) visited.set(projectId, [...list, path].slice(-20));
      }
      if (status === 'failed') realRuns.get(projectId)?.siteDown(log);
    } else if (message.kind === 'verifySite') {
      const domain = domainOf(message.domain);
      const check = !domain
        ? Promise.resolve({ ok: false, message: 'That doesn’t look like a domain.' })
        : message.method === 'dns'
          ? verifyDns(domain, message.token)
          : verifyFile(domain, message.token);
      void check.then((r) => send({ kind: 'verifyResult', id: message.id, ...r }));
    } else if (message.kind === 'voiceUsage') {
      const runId = (realRuns.get(message.projectId)?.state ?? raw.get(message.projectId))?.runId;
      if (runId) ledger.record(voiceEntry(runId, message.projectId, message.usage));
    } else if (message.kind === 'siteHeld') {
      const run = realRuns.get(message.projectId);
      // Only Fitts's own actions are held; with no run to ask, the write doesn't go out.
      if (run) run.held(message.held);
      else
        siteRpc
          .for(message.projectId)
          .release(message.held.id, false)
          .catch(() => undefined);
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
