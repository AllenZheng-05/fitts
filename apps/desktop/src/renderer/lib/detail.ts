// SPEC-phase4 §6A.3: what the "How much Fitts shows while it works" setting shows. It changes
// rendering only; the log is always recorded.
import type { ChatItem, Observation } from '@fitts/schema';
import type { DetailLevel } from '../state/settings';

type StepLine = Extract<ChatItem, { type: 'steps' }>['steps'][number];

/**
 * Highlights keeps only the slow steps and the ones with something noticed; the decider's
 * "Thinking: …" lines and an ability's start and end are for "Every detail" only.
 */
export function showsStep(level: DetailLevel, step: StepLine): boolean {
  if (step.detail) return level === 'all';
  return level !== 'highlights' || Boolean(step.slow) || (step.noticed?.length ?? 0) > 0;
}

/** "Every detail" shows each action's requests and console errors under it. */
export function showsRecord(level: DetailLevel): boolean {
  return level === 'all';
}

/** A step's timing chip: always, except in Highlights, where only slow steps keep it. */
export function showsTiming(level: DetailLevel, step: StepLine): boolean {
  return (
    step.ms !== undefined && step.ms !== null && (level !== 'highlights' || Boolean(step.slow))
  );
}

/** Highlights keeps the noticed lines that matter most (severity hint 3 or more). */
export function showsNote(level: DetailLevel, o: Observation): boolean {
  return level !== 'highlights' || o.severityHint >= 3;
}
