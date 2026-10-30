// Spoken commands (SPEC-phase2 §14): in "Always listening", only an utterance that starts with
// "Fitts" counts. "Fitts, stop" stops the current action; any other "Fitts, …" is a spoken
// interrupt with that text. Bare "stop" or "wait" do nothing (CLAUDE.md). Transcribe sometimes
// hears "Fitz", "Fits" or "Fritz" even with the keyword bias (V5), so those count too.
export type VoiceCommand = { kind: 'stop' } | { kind: 'say'; text: string };

const WAKE = /^\s*(?:hey\s+|ok(?:ay)?\s+)?(fitts|fitz|fits|fritz)\b[\s,.!?:;-]*(.*)$/i;

export function parseVoiceCommand(utterance: string): VoiceCommand | null {
  const m = WAKE.exec(utterance);
  if (!m) return null;
  const rest = (m[2] ?? '').trim();
  if (!rest) return null;
  if (/^(stop|stop it|stop that|hold on|pause)[.!]?$/i.test(rest)) return { kind: 'stop' };
  const text = rest.replace(/^[a-z]/, (c) => c.toUpperCase());
  return { kind: 'say', text };
}
