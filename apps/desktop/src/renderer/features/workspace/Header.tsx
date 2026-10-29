import type { Mode, RunState } from '@fitts/schema';
import { ChevronDown, ChevronUp, FileText, Settings as SettingsIcon } from 'lucide-react';
import { useRef } from 'react';
import { Select } from '../../components/fields';
import { IconButton } from '../../components/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import { CostChip, MicOnChip } from '../../components/StatusChips';
import { Stepper } from '../../components/Stepper';
import { Wordmark } from '../../components/brand/Wordmark';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';
import { format } from '../../lib/format';
import { getEngine } from '../../state/engine';
import { useSettings } from '../../state/settings';
import { useUi } from '../../state/ui';
import { ProjectMenu } from '../projects/ProjectMenu';
import { BriefPopover } from './BriefPopover';

const MODES: Mode[] = ['plan', 'ask-every', 'ask-unsure', 'autonomous'];

/** The workspace header (SPEC §6.2). Doubles as the macOS drag region. */
export function Header({
  run,
  projectId,
  name,
}: {
  run: RunState | undefined;
  projectId: string;
  name: string;
}) {
  const menuOpen = useUi((s) => s.projectMenuOpen);
  const briefOpen = useUi((s) => s.briefOpen);
  const micListening = useUi((s) => s.micListening);
  const talkMode = useSettings((s) => s.talkMode);
  const projectRef = useRef<HTMLButtonElement>(null);
  const briefRef = useRef<HTMLButtonElement>(null);
  const engine = getEngine();
  const auditing = run?.phase === 'audit';
  const paused = run?.activity === 'paused';
  const driving = run?.activity === 'user-driving';

  const counter =
    run?.activity === 'redesigning'
      ? copy.header.counterRedesigning
      : auditing && run.fixingCount > 0
        ? format(copy.header.counterFixing, { n: run.fixingCount })
        : undefined;

  return (
    <header className="app-drag flex flex-none flex-wrap items-center gap-2 px-5 py-3">
      <Wordmark />
      <button
        ref={projectRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-label={format(copy.workspace.projectButton, { name })}
        onClick={() => useUi.getState().set({ projectMenuOpen: !menuOpen })}
        className={cx(
          'app-no-drag inline-flex min-h-10 items-center gap-1.5 rounded-pill px-3 font-mono text-[12px] transition-tint',
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
      <div className="app-no-drag mx-auto">
        {run && <Stepper active={run.phase} counter={counter} />}
      </div>
      {auditing && (
        <div className="app-no-drag">
          <SegmentedControl
            label={copy.header.runControls}
            segments={[
              {
                id: 'pause',
                label: paused ? copy.header.resume : copy.header.pause,
                disabled: driving,
                onClick: () => (paused ? engine.resume(projectId) : engine.pause(projectId)),
              },
              {
                id: 'wheel',
                label: driving ? copy.header.handBack : copy.header.takeWheel,
                onClick: () => (driving ? engine.handBack(projectId) : engine.takeWheel(projectId)),
              },
              {
                id: 'stop',
                label: copy.header.stopRun,
                tone: 'danger',
                onClick: () => engine.stopRun(projectId),
              },
            ]}
          />
        </div>
      )}
      {run && (
        <Select
          label={copy.modes.label}
          hideLabel
          className="app-no-drag"
          value={run.mode}
          disabled={run.phase === 'done'}
          onChange={(e) => engine.setMode(projectId, e.target.value as Mode)}
          options={[
            ...MODES.map((m) => ({ value: m, label: copy.modes[m] })),
            ...(run.mode === 'dangerous'
              ? [{ value: 'dangerous', label: copy.modes.dangerous }]
              : []),
          ]}
        />
      )}
      <IconButton
        ref={briefRef}
        className="app-no-drag"
        aria-label={copy.workspace.brief}
        aria-haspopup="dialog"
        aria-expanded={briefOpen}
        onClick={() => useUi.getState().set({ briefOpen: !briefOpen })}
        icon={<FileText size={18} aria-hidden="true" />}
      />
      {(micListening || talkMode === 'wake') && <MicOnChip />}
      {run && (
        <CostChip
          spentUsd={run.cost.spentUsd}
          capUsd={run.phase === 'audit' ? run.cost.capUsd : undefined}
        />
      )}
      <IconButton
        className="app-no-drag"
        aria-label={copy.workspace.settings}
        onClick={() => useUi.getState().openSettings()}
        icon={<SettingsIcon size={18} aria-hidden="true" />}
      />
      <ProjectMenu anchorRef={projectRef} />
      <BriefPopover projectId={projectId} anchorRef={briefRef} />
    </header>
  );
}
