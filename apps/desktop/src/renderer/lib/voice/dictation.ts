import { useUi } from '../../state/ui';

/**
 * Spoken words go into the message box after whatever was already in it, the way typing would
 * (Allen's feedback, round 4). `base` is the box's text when this stretch of talking began.
 */
let base: string | null = null;

export function beginDictation(): void {
  const draft = useUi.getState().draft;
  base = draft && !/\s$/.test(draft) ? `${draft} ` : draft;
}

/** What's been heard so far replaces what was heard before, after `base`. */
export function dictate(text: string): void {
  if (base === null) beginDictation();
  useUi.getState().set({ draft: `${base ?? ''}${text}`, draftSpoken: true });
}

/** The talking is over; the box keeps its text. Returns what was in the box before it. */
export function endDictation(): string {
  const before = base ?? '';
  base = null;
  useUi.getState().set({ dictationTakenOver: false });
  return before;
}
