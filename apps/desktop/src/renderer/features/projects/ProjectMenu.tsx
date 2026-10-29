import type { Project, RunState } from '@fitts/schema';
import { useRef, useState, type RefObject } from 'react';
import { Button } from '../../components/Button';
import { TextField } from '../../components/fields';
import { Popover } from '../../components/overlay/Popover';
import { StatusDot, type DotStatus } from '../../components/StatusChips';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';
import { format } from '../../lib/format';
import { shortcutLabel } from '../../lib/platform';
import { useProjects } from '../../state/projects';
import { useRunStore } from '../../state/run-store';
import { useUi } from '../../state/ui';
import { needsYou } from './needsYou';

const RUNNING = new Set(['acting', 'redesigning', 'waiting-on-user']);

function describe(project: Project, run: RunState | undefined, current: boolean) {
  const prs = new Set(run?.changes.flatMap((c) => (c.prNumber ? [c.prNumber] : []))).size;
  let dot: DotStatus = 'queued';
  let status: string = copy.projects.neverAudited;
  let running = false;
  if (run?.phase === 'audit') {
    running = RUNNING.has(run.activity);
    dot = 'testing';
    status = !running
      ? format(copy.projects.paused, { step: run.step })
      : format(current ? copy.projects.runningHere : copy.projects.runningCaption, {
          step: run.step,
        });
  } else if (run?.phase === 'done') {
    dot = 'done';
    status = format(copy.projects.finished, { prs });
  } else if (run?.phase === 'interview') {
    dot = 'testing';
    status = copy.projects.interviewing;
  }
  return { dot, caption: `${project.url} · ${status}`, running };
}

/** Project menu: search, switch, add (SPEC §6.9). Opens from the project button or ⌘P. */
export function ProjectMenu({ anchorRef }: { anchorRef: RefObject<HTMLElement | null> }) {
  const open = useUi((s) => s.projectMenuOpen);
  const close = () => useUi.getState().set({ projectMenuOpen: false });
  const projects = useProjects((s) => s.projects);
  const runs = useRunStore((s) => s.runs);
  const activeProjectId = useRunStore((s) => s.activeProjectId);
  const openProject = useUi((s) => s.openProject);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const shown = projects.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.url.toLowerCase().includes(q),
  );

  return (
    <Popover
      open={open}
      onClose={() => {
        close();
        setQuery('');
      }}
      anchorRef={anchorRef}
      width={440}
      initialFocusRef={searchRef}
      aria-label={copy.projects.menuLabel}
      className="gap-2.5 p-3.5"
    >
      <TextField
        ref={searchRef}
        label={copy.projects.search}
        hideLabel
        size="md"
        placeholder={copy.projects.searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
        {shown.map((project) => {
          const current = project.id === activeProjectId;
          const { dot, caption, running } = describe(project, runs[project.id], current);
          return (
            <li key={project.id}>
              <button
                type="button"
                aria-current={current ? 'true' : undefined}
                onClick={() => {
                  setQuery('');
                  openProject(project.id);
                }}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-control px-3 py-2.5 text-left transition-tint',
                  current
                    ? 'border-[1.5px] border-cobalt bg-cobalt-tint'
                    : 'border border-ink bg-card hover:bg-paper',
                )}
              >
                <StatusDot status={dot} className="size-2.5" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <strong className="truncate">{project.name}</strong>
                  <span className="truncate text-[12px] text-muted">{caption}</span>
                </span>
                {current ? (
                  <span className="text-[12px] font-bold text-cobalt-deep">
                    {copy.projects.current}
                  </span>
                ) : needsYou(runs[project.id]) ? (
                  <span className="flex items-center gap-1.5 text-[12px] font-bold text-sun-ink">
                    <span aria-hidden="true" className="size-2 rounded-full bg-sun" />
                    {copy.projects.needsYou}
                  </span>
                ) : running ? (
                  <span className="text-[12px] font-bold text-cobalt-ink">
                    {copy.projects.running}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="px-1 py-2 text-[14px] text-muted">
            {format(copy.projects.noMatches, { query })}
          </li>
        )}
      </ul>
      <Button
        variant="dashed"
        size="md"
        onClick={() => {
          close();
          useUi.getState().set({ addProjectOpen: true });
        }}
      >
        {copy.projects.add}
      </Button>
      <p className="text-[12px] leading-normal text-muted">
        {format(copy.projects.footnote, { key: shortcutLabel(['mod', 'P']) })}
      </p>
    </Popover>
  );
}
