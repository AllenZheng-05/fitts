import type { RunState } from '@fitts/schema';
import { useEffect } from 'react';
import { Chip } from '../../components/Chip';
import { Button } from '../../components/Button';
import { copy } from '../../copy';
import { format } from '../../lib/format';
import { TEST_BUILD } from '../../dev';
import { getEngineKind } from '../../state/engine';
import { useProject } from '../../state/projects';
import { useActiveRun, useRunStore } from '../../state/run-store';
import { openLiveSite } from '../../state/live-site';
import { useUi } from '../../state/ui';
import { AuditLayout } from '../audit/AuditLayout';
import { GateModal } from '../gate/GateModal';
import { isRedesigning } from '../redesign/redesign';
import { RedesignLayout } from '../redesign/RedesignLayout';
import { DoneLayout } from '../summary/DoneLayout';
import { ChatPanel } from '../chat/ChatPanel';
import { useFittsVoice } from '../chat/useFittsVoice';
import { useWakeListening } from '../chat/useWakeListening';
import { ReadyBar } from '../chat/ReadyBar';
import { SiteView } from '../site-view/SiteView';
import { DangerBanner } from './DangerBanner';
import { Header } from './Header';
import { useWorkspaceShortcuts } from './useWorkspaceShortcuts';

/** The workspace: common header plus the layout for the run's phase (SPEC §6.2–§6.8). */
export function Workspace() {
  const projectId = useRunStore((s) => s.activeProjectId);
  const project = useProject(projectId);
  const run = useActiveRun();
  useWorkspaceShortcuts(run);
  useFittsVoice();
  useWakeListening(run);

  // A project opened at launch has no run yet: start its interview (SPEC §4).
  useEffect(() => {
    if (!run && project) useUi.getState().openProject(project.id);
  }, [run, project]);

  // The project's real site (SPEC-phase2 §5): main starts its dev server and site window.
  // A live site opens too, after main re-checks that it's yours (§4.2).
  const siteId = project ? project.id : null;
  useEffect(() => {
    if (siteId) openLiveSite(siteId);
  }, [siteId]);

  const name = project?.name ?? projectId;
  return (
    <div data-backdrop className="flex h-full flex-col">
      <DangerBanner />
      <Header run={run} projectId={projectId} name={name} />
      <main data-backdrop className="flex min-h-0 flex-1 gap-3.5 px-5 pt-1 pb-5">
        {/* The page's one h1, for screen readers; the header shows the same thing visually. */}
        <h1 className="sr-only">{format(copy.workspace.heading, { name })}</h1>
        {run?.phase === 'interview' && <InterviewLayout run={run} />}
        {run?.phase === 'audit' &&
          (isRedesigning(run, !TEST_BUILD || getEngineKind() !== 'mock') ? (
            <RedesignLayout run={run} />
          ) : (
            <AuditLayout run={run} />
          ))}
        {run?.phase === 'done' && <DoneLayout run={run} />}
      </main>
      {run && <GateModal run={run} />}
    </div>
  );
}

/** Interview (SPEC §6.3): site view + 420px chat. The user drives the site. */
function InterviewLayout({ run }: { run: RunState }) {
  const pointing = useUi((s) => s.pointing);
  return (
    <>
      <SiteView
        projectId={run.projectId}
        className="flex-1"
        interactive
        toolbarEnd={
          <>
            {/* Not "You're driving": that means you took the wheel from Fitts mid-run. */}
            <Chip className="px-2.5 py-1.5">{copy.site.yoursToClick}</Chip>
            <Button
              size="sm"
              className="px-3.5 text-[14px]"
              aria-pressed={pointing}
              onClick={() => useUi.getState().set({ pointing: !pointing })}
            >
              {pointing ? copy.site.pointing : copy.site.point}
            </Button>
          </>
        }
      />
      <ChatPanel run={run} className="w-[420px] flex-none" aboveComposer={<ReadyBar run={run} />} />
    </>
  );
}
