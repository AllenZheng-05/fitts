import type { Change, RunState } from '@fitts/schema';
import { useId, useState } from 'react';
import { Button } from '../../components/Button';
import { copy } from '../../copy';
import { getEngine } from '../../state/engine';
import { useUi } from '../../state/ui';

/**
 * Try again on a rolled-back fix: straight away, or with a note for Fitts ("the focus styles
 * are in src/theme.css"). The note goes into the next attempt's task. While it retries, the
 * caller shows what Fitts is doing (run.nowText).
 */
export function RetryControls({
  run,
  change,
  size = 'inline',
}: {
  run: RunState;
  change: Change;
  size?: 'inline' | 'md';
}) {
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const id = useId();
  const retry = (hint?: string) => {
    getEngine().retryChange(run.projectId, change.id, hint?.trim() || undefined);
    // After a run, trying again shows the audit page, to watch it work (round 6).
    if (run.phase === 'done') useUi.getState().set({ doneView: 'audit' });
    setNoting(false);
    setNote('');
  };
  if (!noting)
    return (
      <span className="flex flex-none gap-1.5">
        <Button size={size} variant="sun" onClick={() => retry()}>
          {copy.retry.tryAgain}
        </Button>
        <Button size={size} onClick={() => setNoting(true)}>
          {copy.retry.addNote}
        </Button>
      </span>
    );
  return (
    <form
      className="flex basis-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        retry(note);
      }}
    >
      <label htmlFor={id} className="sr-only">
        {copy.retry.noteLabel}
      </label>
      <input
        id={id}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- opened on purpose to type the note
        autoFocus
        value={note}
        maxLength={500}
        placeholder={copy.retry.notePlaceholder}
        onChange={(e) => setNote(e.target.value)}
        className="min-h-10 min-w-0 flex-[1_1_220px] rounded-control border border-ink bg-card px-3 text-[14px] placeholder:text-muted"
      />
      <Button type="submit" size={size} variant="sun" disabled={!note.trim()}>
        {copy.retry.withNote}
      </Button>
      <Button size={size} onClick={() => setNoting(false)}>
        {copy.overlay.cancel}
      </Button>
    </form>
  );
}
