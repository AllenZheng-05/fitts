// The frame ring (SPEC-phase4 §6B.5): the site window's paint frames, sampled to about 8 fps and
// kept 4 seconds deep, so a surprise event's moment (2 s before and after it) can be saved and
// shown to the judge. Pure: the window pushes, the run asks for a window around an event.

export interface Frame {
  /** Wall-clock ms. */
  at: number;
  jpeg: Buffer;
  width: number;
  height: number;
}

/** About 8 frames a second. */
export const FRAME_GAP_MS = 125;
/** How far back the ring reaches. */
export const RING_MS = 4_000;
/** Each side of an event. */
export const EVENT_SIDE_MS = 2_000;
/** Frames the judge sees at most. */
export const EVENT_FRAMES = 8;

export class FrameRing {
  private frames: Frame[] = [];

  constructor(
    private readonly gapMs = FRAME_GAP_MS,
    private readonly depthMs = RING_MS,
  ) {}

  /** A paint frame; kept when it's at least a gap after the last one. */
  push(frame: Frame): void {
    const last = this.frames.at(-1);
    if (last && frame.at - last.at < this.gapMs) return;
    this.frames.push(frame);
    const oldest = frame.at - this.depthMs;
    while (this.frames.length && (this.frames[0]?.at ?? 0) < oldest) this.frames.shift();
  }

  get size(): number {
    return this.frames.length;
  }

  /**
   * Up to `max` frames from `side` ms before `at` to `side` ms after, evenly spread, always
   * keeping the first and the last (SAM outlines the element in those two).
   */
  around(at: number, side = EVENT_SIDE_MS, max = EVENT_FRAMES): Frame[] {
    const inside = this.frames.filter((f) => f.at >= at - side && f.at <= at + side);
    return spread(inside, max);
  }
}

/** `max` items evenly spread over the list, first and last included. */
export function spread<T>(list: T[], max: number): T[] {
  if (list.length <= max) return [...list];
  if (max <= 1) return list.slice(0, max);
  const out: T[] = [];
  for (let i = 0; i < max; i++) {
    const item = list[Math.round((i * (list.length - 1)) / (max - 1))];
    if (item !== undefined) out.push(item);
  }
  return out;
}
