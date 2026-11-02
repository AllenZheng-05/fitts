// @vitest-environment node
// The surprise judge's frame ring (SPEC-phase4 §6B.5): about 8 fps, 4 s deep, and the window
// around an event (2 s each side, at most 8 frames, first and last kept).
import { describe, expect, it } from 'vitest';
import { EVENT_FRAMES, FrameRing, spread } from '../../src/main/site/frames';

const frame = (at: number) => ({ at, jpeg: Buffer.from(String(at)), width: 10, height: 10 });

describe('the frame ring (≈ 8 fps, 4 s deep)', () => {
  it('keeps a frame per 125 ms and drops what’s older than 4 s', () => {
    const ring = new FrameRing();
    for (let t = 0; t <= 6000; t += 33) ring.push(frame(t));
    expect(ring.size).toBeGreaterThanOrEqual(28);
    expect(ring.size).toBeLessThanOrEqual(33);
    // The last frame lands at 5973 ms: nothing older than 4 s before it stays.
    expect(ring.around(6000, 10_000, 100)[0]?.at).toBeGreaterThanOrEqual(5973 - 4000);
  });

  it('an event’s window: 2 s each side, at most 8 frames, first and last kept', () => {
    const ring = new FrameRing();
    for (let t = 0; t <= 4000; t += 125) ring.push(frame(t));
    const w = ring.around(2500);
    expect(w).toHaveLength(EVENT_FRAMES);
    expect(w[0]?.at).toBe(500);
    expect(w.at(-1)?.at).toBe(4000);
    expect(w.every((f) => f.at >= 500 && f.at <= 4500)).toBe(true);
  });

  it('spread keeps everything when there are few', () => {
    expect(spread([1, 2, 3], 8)).toEqual([1, 2, 3]);
    expect(spread([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4)).toEqual([0, 3, 6, 9]);
  });
});
