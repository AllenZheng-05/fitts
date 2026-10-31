import { useId, useState, type RefObject } from 'react';
import { Button } from '../../components/Button';
import { Popover } from '../../components/overlay/Popover';
import { copy } from '../../copy';
import { briefText } from '../../lib/brief';
import { getEngine } from '../../state/engine';
import { useRun } from '../../state/run-store';
import { useUi } from '../../state/ui';

/**
 * The brief (SPEC §6.10), as one paragraph in the owner's words: one box that grows as you
 * write. Save updates it (Fitts re-reads the details from it) and Fitts acknowledges in chat.
 */
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
      width={460}
      aria-labelledby="brief-title"
      className="p-4"
    >
      {open && <BriefForm projectId={projectId} onDone={close} />}
    </Popover>
  );
}

function BriefForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const run = useRun(projectId);
  const [text, setText] = useState(() => briefText(run?.brief ?? {}));
  const id = useId();
  return (
    <form
      className="flex min-h-0 flex-col gap-3 overflow-y-auto"
      onSubmit={(e) => {
        e.preventDefault();
        const summary = text.trim();
        getEngine().updateBrief(projectId, { ...run?.brief, summary: summary || undefined });
        onDone();
      }}
    >
      <h2 id="brief-title" className="font-display text-[18px] font-bold">
        {copy.brief.popoverTitle}
      </h2>
      <label htmlFor={id} className="text-[14px] font-semibold">
        {copy.brief.boxLabel}
      </label>
      <textarea
        id={id}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the popover opens to edit the brief
        autoFocus
        rows={6}
        value={text}
        placeholder={copy.brief.boxPlaceholder}
        aria-describedby={`${id}-hint`}
        onChange={(e) => setText(e.target.value)}
        className="max-h-[50vh] min-h-36 resize-none rounded-control border border-ink bg-card px-3.5 py-3 text-[15px] leading-normal field-sizing-content placeholder:text-muted"
      />
      <span id={`${id}-hint`} className="text-[13px] text-muted">
        {copy.brief.boxHint}
      </span>
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
