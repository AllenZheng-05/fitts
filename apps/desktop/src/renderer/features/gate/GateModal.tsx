import type { RunState } from '@fitts/schema';
import { TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Checkbox } from '../../components/fields';
import { Modal } from '../../components/overlay/Modal';
import { RichText } from '../../components/RichText';
import { copy } from '../../copy';
import { format } from '../../lib/format';
import { getEngine } from '../../state/engine';
import { useProject } from '../../state/projects';

/**
 * Destructive-action gate (SPEC §7.8). An alertdialog that holds the run until the user
 * decides; "Don't do it" has focus, Esc means "Don't do it", and "Allow once" unlocks only
 * after the box is checked.
 */
export function GateModal({ run }: { run: RunState }) {
  const gate = run.gate;
  if (!gate) return null;
  return <Gate key={gate.id} run={run} />;
}

function Gate({ run }: { run: RunState }) {
  const gate = run.gate;
  const project = useProject(run.projectId);
  const [understood, setUnderstood] = useState(false);
  const denyRef = useRef<HTMLButtonElement>(null);
  if (!gate) return null;
  const respond = (decision: 'deny' | 'other' | 'allow') =>
    getEngine().respondGate(run.projectId, gate.id, decision);
  const url = project?.url ?? 'localhost';
  const mode = run.mode === 'dangerous' ? copy.modes.dangerous : copy.modes[run.mode];

  return (
    <Modal
      open
      onClose={() => respond('deny')}
      labelledBy="gate-title"
      describedBy="gate-desc"
      role="alertdialog"
      tone="danger"
      width={600}
      initialFocusRef={denyRef}
    >
      <div className="flex items-center gap-3 border-b-2 border-ink bg-danger px-[22px] py-4 text-card">
        <TriangleAlert size={24} strokeWidth={2.2} aria-hidden="true" />
        <h1 id="gate-title" className="font-display text-[21px] font-extrabold">
          {copy.gate.title}
        </h1>
      </div>
      <div className="flex flex-col gap-3.5 overflow-y-auto px-[22px] py-5">
        <p id="gate-desc" className="text-[16px] leading-normal">
          <RichText text={format(copy.gate.body, { action: gate.action, route: gate.route })} />
        </p>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3.5 gap-y-2 rounded-card border border-ink bg-surface-2 p-3.5 text-[14px]">
          <dt className="text-muted">{copy.gate.click}</dt>
          <dd>{format(copy.gate.clickValue, { action: gate.action })}</dd>
          <dt className="text-muted">{copy.gate.holding}</dt>
          <dd className="font-mono text-[13px]">{gate.heldRequest}</dd>
          <dt className="text-muted">{copy.gate.testing}</dt>
          <dd>{gate.testing}</dd>
          <dt className="text-muted">{copy.gate.mode}</dt>
          <dd>{format(copy.gate.modeValue, { mode })}</dd>
        </dl>
        <Checkbox
          tone="danger"
          label={format(copy.gate.understand, { url })}
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
        />
        <div className="flex flex-wrap gap-2.5">
          <Button
            ref={denyRef}
            variant="dark"
            size="md"
            className="min-h-[50px] flex-[2_1_150px] rounded-card"
            onClick={() => respond('deny')}
          >
            {copy.gate.deny}
          </Button>
          <Button
            size="md"
            className="min-h-[50px] flex-[2_1_150px] rounded-card"
            onClick={() => respond('other')}
          >
            {copy.gate.other}
          </Button>
          <Button
            variant="danger-outline"
            size="md"
            className="min-h-[50px] flex-[1_1_130px] rounded-card"
            disabled={!understood}
            onClick={() => respond('allow')}
          >
            {copy.gate.allow}
          </Button>
        </div>
        <span className="text-[13px] text-muted">{copy.gate.caption}</span>
      </div>
    </Modal>
  );
}
