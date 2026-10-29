import type { RunState } from '@fitts/schema';
import type { copy } from '../../copy';

export type ChatStatus = keyof typeof copy.chat.status;

/** The status line under "Fitts" in the chat header (SPEC §6.4). */
export function chatStatus(run: RunState | undefined, speaking: boolean): ChatStatus {
  if (speaking) return 'speaking';
  if (!run || run.phase === 'interview') return 'listening';
  if (run.phase === 'done') return 'done';
  switch (run.activity) {
    case 'paused':
      return 'paused';
    case 'waiting-on-user':
      return 'waiting';
    case 'user-driving':
      return 'driving';
    case 'redesigning':
      return 'redesigning';
    default:
      return 'working';
  }
}

/** Text and dot classes per status. Mint = listening/done, cobalt = Fitts acting. */
export const STATUS_STYLE: Record<ChatStatus, { text: string; dot: string }> = {
  listening: { text: 'text-mint-ink', dot: 'bg-mint' },
  speaking: { text: 'text-cobalt-ink', dot: 'bg-cobalt' },
  working: { text: 'text-cobalt-ink', dot: 'bg-cobalt' },
  paused: { text: 'text-muted', dot: 'bg-ink-faint' },
  waiting: { text: 'text-sun-ink', dot: 'bg-sun' },
  driving: { text: 'text-sun-ink', dot: 'bg-sun' },
  redesigning: { text: 'text-lilac-ink', dot: 'bg-lilac' },
  done: { text: 'text-mint-ink', dot: 'bg-mint' },
};
