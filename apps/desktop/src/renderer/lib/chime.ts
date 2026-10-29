// The listening chime (SPEC §7.5): a short sine blip, rising when the mic starts and
// falling when it stops. Made with WebAudio, so there's no audio file to bundle.

let context: AudioContext | undefined;

export function chime(kind: 'start' | 'stop'): void {
  try {
    context ??= new AudioContext();
    const osc = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(kind === 'start' ? 660 : 880, now);
    osc.frequency.exponentialRampToValueAtTime(kind === 'start' ? 990 : 590, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain).connect(context.destination);
    osc.start(now);
    osc.stop(now + 0.18);
    recordForTests(`chime:${kind}`);
  } catch {
    // No audio device: the chime is a nicety, never a blocker.
  }
}

/** Dev/e2e only: what Fitts played or said, since tests can't listen. */
export function recordForTests(entry: string): void {
  if (!__FITTS_DEV_TOOLS__) return;
  const w = window as { __fittsAudio?: string[] };
  (w.__fittsAudio ??= []).push(entry);
}
