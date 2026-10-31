import type { Brief } from '@fitts/schema';
import { useRef, useState, type RefObject } from 'react';
import { Button } from '../../components/Button';
import { TextField } from '../../components/fields';
import { Popover } from '../../components/overlay/Popover';
import { copy } from '../../copy';
import { getEngine } from '../../state/engine';
import { useRun } from '../../state/run-store';
import { useUi } from '../../state/ui';

const FIELDS = [
  'for',
  'who',
  'feel',
  'look',
  'keep',
  'avoid',
  'inspiration',
  'boldness',
  'pain',
  'flows',
  'outOfScope',
] as const;
const HINTED = new Set<string>([
  'flows',
  'outOfScope',
  'look',
  'keep',
  'avoid',
  'inspiration',
  'boldness',
]);

/** Editable brief (SPEC §6.10). Save updates the brief and Fitts acknowledges in chat. */
export function BriefPopover({
  projectId,
  anchorRef,
}: {
  projectId: string;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const open = useUi((s) => s.briefOpen);
  const close = () => useUi.getState().set({ briefOpen: false });
  return (
    <Popover
      open={open}
      onClose={close}
      anchorRef={anchorRef}
      align="end"
      width={360}
      aria-labelledby="brief-title"
      className="p-4"
    >
      {open && <BriefForm projectId={projectId} onDone={close} />}
    </Popover>
  );
}

function BriefForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const run = useRun(projectId);
  const [brief, setBrief] = useState<Brief>(() => ({ ...run?.brief }));
  const firstRef = useRef<HTMLInputElement>(null);
  return (
    <form
      className="flex min-h-0 flex-col gap-3 overflow-y-auto"
      onSubmit={(e) => {
        e.preventDefault();
        getEngine().updateBrief(projectId, brief);
        onDone();
      }}
    >
      <h2 id="brief-title" className="font-display text-[18px] font-bold">
        {copy.brief.popoverTitle}
      </h2>
      {FIELDS.map((key, i) => (
        <TextField
          key={key}
          ref={i === 0 ? firstRef : undefined}
          label={copy.brief.fields[key]}
          size="md"
          value={brief[key] ?? ''}
          placeholder={
            HINTED.has(key)
              ? copy.brief.placeholders[key as keyof typeof copy.brief.placeholders]
              : undefined
          }
          onChange={(e) => setBrief((b) => ({ ...b, [key]: e.target.value || undefined }))}
        />
      ))}
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onDone}>
          {copy.overlay.cancel}
        </Button>
        <Button type="submit" variant="primary" size="sm">
          {copy.brief.save}
        </Button>
      </div>
    </form>
  );
}
