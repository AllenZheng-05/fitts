import type { ChatItem, RunState } from '@fitts/schema';
import { getEngine } from '../../state/engine';
import { useUi, type Decision } from '../../state/ui';

export type Batch = Extract<ChatItem, { type: 'approval.batch' }>;

/** The unanswered batch of fixes a finding belongs to, if Fitts is waiting on one. */
export function pendingBatchFor(run: RunState, findingId: string): Batch | undefined {
  return [...run.chat]
    .reverse()
    .find(
      (c): c is Batch =>
        c.type === 'approval.batch' && c.answer === undefined && c.findingIds.includes(findingId),
    );
}

/** Your calls so far on `batch` ("Review each"). */
export function decisionsFor(batch: Batch): Record<string, Decision> {
  const review = useUi.getState().review;
  return review?.itemId === batch.id ? review.decisions : {};
}

/** The first fix in `batch` still waiting on you, looking after `fromId` first. */
export function nextUndecided(
  batch: Batch,
  decisions: Record<string, Decision>,
  fromId?: string,
): string | undefined {
  const ids = batch.findingIds;
  const start = fromId ? ids.indexOf(fromId) + 1 : 0;
  const ordered = [...ids.slice(start), ...ids.slice(0, start)];
  return ordered.find((id) => decisions[id] === undefined);
}

/** Opens the Finding panel on the next fix in `batch` to decide (the "Review each" button). */
export function startReview(batch: Batch): void {
  const decisions = decisionsFor(batch);
  useUi.getState().set({
    review: { itemId: batch.id, decisions },
    openFindingId: nextUndecided(batch, decisions) ?? batch.findingIds[0] ?? null,
  });
}

/**
 * Records (or changes) your call on one fix and moves to the next undecided one. Nothing is
 * sent until you press Go ahead, so every call can be changed until then.
 */
export function decide(batch: Batch, findingId: string, decision: Decision): void {
  const decisions = { ...decisionsFor(batch), [findingId]: decision };
  const next = nextUndecided(batch, decisions, findingId);
  useUi.getState().set({
    review: { itemId: batch.id, decisions },
    openFindingId: next ?? findingId,
  });
}

/**
 * Go ahead: the fixes you approved start, the ones that aren't problems are dismissed, and the
 * skipped ones stay open. The batch is answered and the panel closes.
 */
export function finishReview(run: RunState, batch: Batch): void {
  const decisions = decisionsFor(batch);
  const engine = getEngine();
  for (const id of batch.findingIds)
    if (decisions[id] === 'dismiss') engine.dismissFinding(run.projectId, id);
  useUi.getState().set({ review: null, openFindingId: null });
  engine.approveFixes(
    run.projectId,
    batch.findingIds.filter((id) => decisions[id] === 'fix'),
  );
}
