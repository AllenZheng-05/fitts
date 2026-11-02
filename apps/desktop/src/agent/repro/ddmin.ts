// ddmin for repros (SPEC-phase4 §5.2 step 3): one pass that tries removing halves, then
// quarters, then single steps, replaying after each removal with the finding's own oracle.
// A removal stays only when the problem is still seen. It stops when no single step can be
// removed, at the replay cap, or when the run stops. Pure: the replay is a callback.

/** Replays per finding, on top of the confirmation replay. */
export const DDMIN_REPLAYS = 8;

export type Verdict = 'seen' | 'not-seen' | 'stop';

export interface DdminResult<T> {
  steps: T[];
  replays: number;
  /** It ran out of replays before trying every single step. */
  capped: boolean;
}

/**
 * Shrinks `steps` (already known to reproduce). `reproduces` replays a candidate; 'stop' (the
 * run ended, or the replayer failed) ends the pass with what has been confirmed so far.
 */
export async function ddmin<T>(
  steps: T[],
  reproduces: (candidate: T[]) => Promise<Verdict>,
  cap = DDMIN_REPLAYS,
): Promise<DdminResult<T>> {
  let current = [...steps];
  let replays = 0;
  // Halves, then quarters, then single steps: each chunk size once, in that order.
  const sizes: number[] = [];
  for (let parts = 2; ; parts *= 2) {
    const size = Math.ceil(steps.length / parts);
    if (size > 1) sizes.push(size);
    if (size <= 1) break;
  }
  sizes.push(1);
  for (const size of [...new Set(sizes)]) {
    let i = 0;
    while (i < current.length) {
      if (current.length <= 1) return { steps: current, replays, capped: false };
      if (replays >= cap) return { steps: current, replays, capped: true };
      const candidate = [...current.slice(0, i), ...current.slice(i + size)];
      if (candidate.length === 0) {
        i += size;
        continue;
      }
      replays += 1;
      const verdict = await reproduces(candidate);
      if (verdict === 'stop') return { steps: current, replays, capped: false };
      // Kept: the same index now holds the next chunk. Not kept: move past this chunk.
      if (verdict === 'seen') current = candidate;
      else i += size;
    }
  }
  return { steps: current, replays, capped: false };
}
