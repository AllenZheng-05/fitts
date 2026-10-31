// The "I'm listening" chime: two short soft notes, made with Web Audio (no sound file). Played
// when "Always listening" hears "Fitts", so you know it heard you before you say the rest.
let ctx: AudioContext | undefined;

export function chime(): void {
  if (typeof AudioContext === 'undefined') return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const start = ctx.currentTime + 0.01;
    // A rising fifth, 90ms apart: friendly, short and not like a system alert.
    for (const [i, freq] of [660, 990].entries()) {
      const t = start + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    }
  } catch {
    // No audio device: the message box still shows that Fitts is listening.
  }
}
