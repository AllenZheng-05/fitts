import type { RunState } from '@fitts/schema';

/** Fitts is held on a question, gate or approval in this run (SPEC §7.7). */
export const needsYou = (run: RunState | undefined) =>
  run?.phase === 'audit' && (run.waitingFor !== undefined || run.activity === 'waiting-on-user');
