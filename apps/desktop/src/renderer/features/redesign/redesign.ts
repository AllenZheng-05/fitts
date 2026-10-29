import type { ChatItem, RunState } from '@fitts/schema';

/** The direction shown in the AFTER pane: the picked one, else the one Fitts would apply. */
export function currentDirection(run: RunState): string {
  const item = [...run.chat]
    .reverse()
    .find((c): c is Extract<ChatItem, { type: 'directions' }> => c.type === 'directions');
  return item?.selectedId ?? 'quiet';
}

/** True while a redesign is proposed or applied (SPEC §6.7). */
export const isRedesigning = (run: RunState) =>
  run.phase === 'audit' && run.chat.some((c) => c.type === 'lookfeel');
