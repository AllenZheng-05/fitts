// Dev-only Scenario panel (SPEC §9.6): jump to any screen or edge state.
import { X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/Button';
import { Select, Switch } from '../../components/fields';
import { IconButton } from '../../components/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import { cx } from '../../lib/cx';
import { SCENARIOS, type ScenarioEntry, type ScenarioScreen } from '../../mock/scenarios';
import { getMockEngine } from '../../state/engine';
import type { Speed } from '../../state/mock-engine';
import { useRunStore } from '../../state/run-store';
import { loadScenario } from '../../state/scenario-loader';
import { useSettings } from '../../state/settings';

/** Screens the app can show so far; other entries stay disabled until their milestone. */
const AVAILABLE_SCREENS: ScenarioScreen[] = [
  'welcome',
  'welcome-back',
  'workspace',
  'settings',
  'project-menu',
  'add-project',
  'brief',
  'finding',
];

const GROUPS: ScenarioEntry['group'][] = ['Runs', 'Screens', 'Edge states'];

const isShortcut = (e: KeyboardEvent) =>
  (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd';

export function ScenarioPanel() {
  const [open, setOpen] = useState(false);
  const [speed, setSpeed] = useState<Speed>(getMockEngine().getSpeed());
  const scenarioId = useRunStore((s) => s.scenarioId);
  const activeProjectId = useRunStore((s) => s.activeProjectId);
  // Re-read the script whenever the active run changes.
  useRunStore((s) => s.runs[s.activeProjectId]);
  const speaksAloud = useSettings((s) => s.speaksAloud);
  const setSpeaksAloud = useSettings((s) => s.setSpeaksAloud);
  const headingId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcut(e)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  const engine = getMockEngine();
  const script = engine.getScript(activeProjectId);

  // Portalled outside #root so it stays usable while a modal makes the app inert.
  return createPortal(
    <aside
      aria-labelledby={headingId}
      className="fixed bottom-5 left-5 z-[70] flex max-h-[min(640px,calc(100vh-40px))] w-[320px] flex-col overflow-hidden rounded-sheet border-[1.5px] border-ink bg-card shadow-hero"
    >
      <div className="flex flex-none items-center gap-2 border-b border-ink px-3.5 py-2.5">
        <h2 id={headingId} className="mr-auto font-display text-[16px] font-bold">
          Scenarios
        </h2>
        <IconButton
          size="sm"
          aria-label="Close the Scenario panel"
          onClick={() => setOpen(false)}
          icon={<X size={15} strokeWidth={2.5} aria-hidden="true" />}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {GROUPS.map((group) => (
          <div key={group} role="group" aria-label={group} className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-muted">{group}</span>
            {SCENARIOS.filter((s) => s.group === group).map((entry) => {
              const available = AVAILABLE_SCREENS.includes(entry.screen);
              const current = entry.id === scenarioId;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={current}
                  disabled={!available}
                  onClick={() => loadScenario(entry.id)}
                  className={cx(
                    'flex min-h-9 items-center justify-between gap-2 rounded-row px-2.5 text-left text-[13px] font-semibold transition-tint',
                    'disabled:cursor-not-allowed disabled:text-disabled-ink',
                    current ? 'bg-cobalt-tint text-cobalt-deep' : 'text-ink enabled:hover:bg-paper',
                  )}
                >
                  {entry.label}
                  {!available && entry.arrives && (
                    <span className="font-mono text-[11px] font-normal">{entry.arrives}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-none flex-col gap-2.5 border-t border-ink px-3.5 py-3">
        <div className="flex items-center gap-2">
          <SegmentedControl
            label="Speed"
            selected={String(speed)}
            onSelect={(id) => {
              const next = Number(id) as Speed;
              engine.setSpeed(next);
              setSpeed(next);
            }}
            segments={[
              { id: '1', label: '1×' },
              { id: '2', label: '2×' },
              { id: '4', label: '4×' },
            ]}
          />
          <Button
            size="sm"
            className="ml-auto"
            disabled={!scenarioId}
            onClick={() => scenarioId && loadScenario(scenarioId)}
          >
            Restart scenario
          </Button>
        </div>
        <Select
          label="Jump to beat"
          size="md"
          disabled={script.beats.length === 0}
          value=""
          onChange={(e) => engine.jumpToBeat(activeProjectId, Number(e.target.value))}
          options={[
            { value: '', label: script.beats.length ? 'Pick a beat…' : 'No script running' },
            ...script.beats.map((b, i) => ({ value: String(i), label: b.label })),
          ]}
        />
        <Switch label="Fitts speaks out loud" checked={speaksAloud} onChange={setSpeaksAloud} />
      </div>
    </aside>,
    document.body,
  );
}
