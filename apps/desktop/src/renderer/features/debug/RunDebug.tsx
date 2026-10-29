// Dev-only M2 stand-in for the workspace: the active RunState as JSON, plus buttons that
// drive the engine so runs can be clicked through before the real screens exist.
import type { ChatItem, RunState } from '@fitts/schema';
import { Button } from '../../components/Button';
import { Select } from '../../components/fields';
import { Panel } from '../../components/Panel';
import { Wordmark } from '../../components/brand/Wordmark';
import { Kbd } from '../../components/Kbd';
import { DEMO_PROJECTS } from '../../mock/fixtures/projects';
import { getEngine } from '../../state/engine';
import { useActiveRun, useRunStore } from '../../state/run-store';

type Answerable = Extract<ChatItem, { type: 'question' | 'state' }>;

function openCard(run: RunState): Answerable | undefined {
  return [...run.chat]
    .reverse()
    .find((c): c is Answerable => (c.type === 'question' || c.type === 'state') && !c.answer);
}

const STATE_FIRST_ANSWER: Record<string, string> = {
  'stop-run-confirm': 'stop',
  stopped: 'resume',
  uncommitted: 'save',
  'login-wall': 'skip',
  'site-down': 'restart',
  budget: 'add-10',
  'api-trouble': 'retry-now',
  reopen: 'resume',
  'nothing-found': 'see-checks',
};

export function RunDebug() {
  const run = useActiveRun();
  const activeProjectId = useRunStore((s) => s.activeProjectId);
  const setActiveProject = useRunStore((s) => s.setActiveProject);
  const engine = getEngine();

  return (
    <div className="flex h-full flex-col gap-3.5 px-5 pb-5">
      <header className="flex flex-none items-center gap-3 pt-3">
        <Wordmark />
        <h1 className="font-display text-[26px] font-extrabold tracking-[-0.02em]">Run state</h1>
        <span className="text-[13px] text-muted">
          Dev only · <Kbd keys={['mod', 'shift', 'D']} /> opens the Scenario panel
        </span>
        <Select
          label="Project"
          hideLabel
          className="ml-auto"
          value={activeProjectId}
          onChange={(e) => setActiveProject(e.target.value)}
          options={DEMO_PROJECTS.map((p) => ({ value: p.id, label: p.name }))}
        />
        <a href="#/gallery" className="text-[14px] font-semibold text-cobalt-ink">
          Gallery
        </a>
      </header>

      {run ? (
        <Panel
          label="Run state JSON"
          title={`${run.runId} · ${run.phase} · ${run.activity}${run.waitingFor ? ` · waiting for ${run.waitingFor}` : ''}`}
          toolbar={<Actions run={run} engine={engine} />}
          className="flex-1"
          bodyClassName="pt-3"
        >
          <pre className="font-mono text-[12px] leading-[1.5] whitespace-pre-wrap text-ink-2">
            {JSON.stringify(run, null, 2)}
          </pre>
        </Panel>
      ) : (
        <Panel label="No run" className="flex-1" bodyClassName="flex items-center justify-center">
          <p className="text-[15px] text-muted">
            No run for this project yet. Pick a scenario in the Scenario panel.
          </p>
        </Panel>
      )}
    </div>
  );
}

function Actions({ run, engine }: { run: RunState; engine: ReturnType<typeof getEngine> }) {
  const id = run.projectId;
  const card = openCard(run);
  const approval = [...run.chat].reverse().find((c) => c.type === 'approval.batch');
  const directions = [...run.chat].reverse().find((c) => c.type === 'directions');
  const verified = run.changes.find((c) => c.status === 'verified');
  const retryable = run.changes.find((c) => c.status === 'rolled-back' || c.status === 'undone');
  const driving = run.activity === 'user-driving';

  return (
    <>
      {run.phase === 'interview' && (
        <>
          <Button
            size="sm"
            onClick={() => engine.answerInterview(id, 'A messaging app for my family')}
          >
            Answer
          </Button>
          <Button size="sm" variant="primary" onClick={() => engine.startAudit(id)}>
            Start the audit
          </Button>
        </>
      )}
      {run.phase === 'audit' && (
        <>
          <Button
            size="sm"
            onClick={() => (run.activity === 'paused' ? engine.resume(id) : engine.pause(id))}
          >
            {run.activity === 'paused' ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" onClick={() => engine.stopAction(id)}>
            Stop action
          </Button>
          <Button size="sm" onClick={() => engine.stopRun(id)}>
            Stop run
          </Button>
          <Button size="sm" onClick={() => (driving ? engine.handBack(id) : engine.takeWheel(id))}>
            {driving ? 'Hand back' : 'Take the wheel'}
          </Button>
          <Button size="sm" onClick={() => engine.sendMessage(id, 'check search next')}>
            Interject
          </Button>
          {run.queued.length > 0 && (
            <Button size="sm" onClick={() => engine.interruptNow(id)}>
              Interrupt now
            </Button>
          )}
        </>
      )}
      {run.waitingFor === 'approval' && approval?.type === 'approval.batch' && (
        <Button
          size="sm"
          variant="primary"
          onClick={() => engine.approveFixes(id, approval.findingIds)}
        >
          Fix all
        </Button>
      )}
      {run.waitingFor === 'approval' && directions?.type === 'directions' && (
        <Button size="sm" variant="primary" onClick={() => engine.pickDirection(id, 'warm')}>
          Pick Warm
        </Button>
      )}
      {run.gate && (
        <Button
          size="sm"
          variant="dark"
          onClick={() => engine.respondGate(id, run.gate?.id ?? '', 'deny')}
        >
          Don&apos;t do it
        </Button>
      )}
      {card && (
        <Button
          size="sm"
          onClick={() =>
            engine.answerQuestion(
              id,
              card.id,
              card.type === 'question'
                ? (card.options[0] ?? '')
                : (STATE_FIRST_ANSWER[card.stateKind] ?? ''),
            )
          }
        >
          Answer card
        </Button>
      )}
      {run.phase === 'done' && verified && (
        <Button size="sm" onClick={() => engine.undoChange(id, verified.id)}>
          Undo a change
        </Button>
      )}
      {run.phase === 'done' && retryable && (
        <Button size="sm" onClick={() => engine.retryChange(id, retryable.id)}>
          Try again
        </Button>
      )}
      {run.phase === 'done' && (
        <Button size="sm" variant="primary" onClick={() => engine.startInterview(id)}>
          New run
        </Button>
      )}
    </>
  );
}
