import { ChevronDown, ChevronUp, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { IconButton } from '../../components/IconButton';
import { Panel } from '../../components/Panel';
import { Wordmark } from '../../components/brand/Wordmark';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';
import { format } from '../../lib/format';
import { useProject } from '../../state/projects';
import { useActiveRun, useRunStore } from '../../state/run-store';
import { useUi } from '../../state/ui';
import { ProjectMenu } from '../projects/ProjectMenu';
import { DangerBanner } from './DangerBanner';

/** M3 shell: header with the project button and Settings. M4 builds the full workspace. */
export function Workspace() {
  const projectId = useRunStore((s) => s.activeProjectId);
  const project = useProject(projectId);
  const run = useActiveRun();
  const menuOpen = useUi((s) => s.projectMenuOpen);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // A project opened at launch has no run yet: start its interview (SPEC §4).
  useEffect(() => {
    if (!run && project) useUi.getState().openProject(project.id);
  }, [run, project]);

  const name = project?.name ?? projectId;
  return (
    <div className="flex h-full flex-col">
      <DangerBanner />
      <header className="flex flex-none flex-wrap items-center gap-2 px-5 py-3">
        <Wordmark />
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-label={format(copy.workspace.projectButton, { name })}
          onClick={() => useUi.getState().set({ projectMenuOpen: !menuOpen })}
          className={cx(
            'inline-flex min-h-10 items-center gap-1.5 rounded-pill px-3 font-mono text-[12px] transition-tint',
            menuOpen
              ? 'border-[1.5px] border-cobalt bg-cobalt-tint'
              : 'border border-ink bg-card hover:bg-paper',
          )}
        >
          {name}
          {menuOpen ? (
            <ChevronUp size={12} strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <ChevronDown size={12} strokeWidth={2.5} aria-hidden="true" />
          )}
        </button>
        <span className="mx-auto" />
        <IconButton
          aria-label={copy.workspace.settings}
          onClick={() => useUi.getState().openSettings()}
          icon={<SettingsIcon size={18} aria-hidden="true" />}
        />
      </header>
      <div className="flex min-h-0 flex-1 px-5 pb-5">
        <Panel label={name} className="flex-1" bodyClassName="flex items-center justify-center">
          <p className="text-[15px] text-muted">
            {run ? `${run.runId} · ${run.phase}` : ''} · {copy.workspace.placeholder}
          </p>
        </Panel>
      </div>
      <ProjectMenu anchorRef={buttonRef} />
    </div>
  );
}
