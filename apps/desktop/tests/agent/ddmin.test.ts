// @vitest-environment node
// ddmin for repros (SPEC-phase4 §5.2 step 3) with a fake oracle.
import { describe, expect, it } from 'vitest';
import { DDMIN_REPLAYS, ddmin, type Verdict } from '../../src/agent/repro/ddmin';

const steps = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
/** The problem shows when every one of `needed` is still in the steps. */
const oracle =
  (needed: number[], log: number[][] = []) =>
  (candidate: number[]) => {
    log.push(candidate);
    return Promise.resolve<Verdict>(
      needed.every((n) => candidate.includes(n)) ? 'seen' : 'not-seen',
    );
  };

describe('ddmin', () => {
  it('a 12-step trail where only steps 3 and 9 matter shrinks to exactly those two', async () => {
    const r = await ddmin(steps(12), oracle([3, 9]), 50);
    expect(r.steps).toEqual([3, 9]);
    expect(r.capped).toBe(false);
  });

  it('the cap stops it at 8 replays, keeping what was confirmed so far', async () => {
    const log: number[][] = [];
    const r = await ddmin(steps(12), oracle([3, 9], log));
    expect(DDMIN_REPLAYS).toBe(8);
    expect(r.replays).toBe(8);
    expect(log).toHaveLength(8);
    expect(r.capped).toBe(true);
    // Halves fail, two quarters go, then single steps until the cap.
    expect(r.steps).toEqual([3, 7, 8, 9]);
    expect(r.steps).toEqual(expect.arrayContaining([3, 9]));
  });

  it('a trail where nothing can be removed stays as it is', async () => {
    const r = await ddmin(steps(4), oracle([1, 2, 3, 4]), 50);
    expect(r.steps).toEqual([1, 2, 3, 4]);
  });

  it('a stop (the run ended or the replayer failed) keeps the last confirmed steps', async () => {
    let n = 0;
    const r = await ddmin(steps(6), () => Promise.resolve<Verdict>(n++ === 0 ? 'seen' : 'stop'));
    expect(r.steps).toEqual([4, 5, 6]);
    expect(r.replays).toBe(2);
  });
});
