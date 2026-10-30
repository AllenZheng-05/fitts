import type { ChatItem, RunState } from '@fitts/schema';
import { copy } from '../../copy';

/** The direction shown in the AFTER pane: the picked one, else the one Fitts would apply. */
export function currentDirection(run: RunState): string {
  const item = [...run.chat]
    .reverse()
    .find((c): c is Extract<ChatItem, { type: 'directions' }> => c.type === 'directions');
  return item?.selectedId ?? 'quiet';
}

/** Fitts is waiting for a look to be picked (the real engine's "Which look?" question). */
const pickOpen = (run: RunState) =>
  run.chat.some(
    (c) =>
      c.type === 'question' && c.answer === undefined && c.options.includes(copy.fitts.keepLook),
  );

/**
 * True while a redesign is proposed or applied (SPEC §6.7). On the mock, from the look-and-feel
 * card on. On a real run only while the pick is open or the look is being applied, so the
 * findings tray is back for the fixes that follow (SPEC-phase2 §8.3).
 */
export const isRedesigning = (run: RunState, real = false) =>
  run.phase === 'audit' &&
  (real
    ? run.activity === 'redesigning' || pickOpen(run)
    : run.chat.some((c) => c.type === 'lookfeel'));
