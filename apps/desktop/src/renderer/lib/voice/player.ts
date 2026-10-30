// Plays Fitts's ElevenLabs voice (SPEC-phase2 §14): 24 kHz s16le PCM chunks from main, queued
// back to back through Web Audio. `stop` fades out within 100ms (barge-in, cut-offs).

const RATE = 24_000;
const FADE_S = 0.08;

export class PcmPlayer {
  private ctx: AudioContext | undefined;
  private gain: GainNode | undefined;
  private nextAt = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private endedCb: (() => void) | undefined;
  private finished = false;

  private context(): { ctx: AudioContext; gain: GainNode } {
    if (!this.ctx || !this.gain) {
      this.ctx = new AudioContext({ sampleRate: RATE });
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    return { ctx: this.ctx, gain: this.gain };
  }

  /** Starts a new line: anything still playing is cut off. */
  begin(onEnded: () => void): void {
    this.stop(false);
    const { ctx, gain } = this.context();
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(1, ctx.currentTime);
    this.nextAt = ctx.currentTime + 0.05;
    this.endedCb = onEnded;
    this.finished = false;
  }

  push(pcm: ArrayBuffer): void {
    const { ctx, gain } = this.context();
    const samples = new Int16Array(pcm);
    if (samples.length === 0) return;
    const buffer = ctx.createBuffer(1, samples.length, RATE);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) data[i] = (samples[i] ?? 0) / 0x8000;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    const at = Math.max(this.nextAt, ctx.currentTime);
    src.start(at);
    this.nextAt = at + buffer.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (this.finished && this.sources.size === 0) this.done();
    };
  }

  /** No more chunks for this line: it ends when the queue drains. */
  finish(): void {
    this.finished = true;
    if (this.sources.size === 0) this.done();
  }

  private done(): void {
    const cb = this.endedCb;
    this.endedCb = undefined;
    cb?.();
  }

  /** Fades out (or cuts) whatever is playing. */
  stop(fade = true): void {
    const ctx = this.ctx;
    const gain = this.gain;
    const playing = [...this.sources];
    this.sources.clear();
    this.endedCb = undefined;
    if (!ctx || !gain) return;
    const now = ctx.currentTime;
    if (fade) {
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE_S);
    }
    for (const s of playing) {
      try {
        s.stop(fade ? now + FADE_S : now);
      } catch {
        // Already stopped.
      }
    }
  }
}
