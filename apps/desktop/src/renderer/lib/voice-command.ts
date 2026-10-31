// Spoken commands (SPEC-phase2 §14): in "Always listening", only an utterance that starts with
// "Fitts" counts. "Fitts, stop" stops the current action; any other "Fitts, …" is a spoken
// interrupt with that text. "Fitts" on its own wakes Fitts up: the next thing said is for it.
// Bare "stop" or "wait" do nothing (CLAUDE.md). Transcribe sometimes hears "Fitz", "Fits" or
// "Fritz" even with the keyword bias (V5), so those count too.
export type VoiceCommand = { kind: 'stop' } | { kind: 'say'; text: string } | { kind: 'wake' };

const WAKE =
  /^\s*(?:hey,?\s+|ok(?:ay)?,?\s+)?(fitts|fittz|fitz|fits|fit's|fritz|phitts)(?![a-z])[\s,.!?:;'-]*(.*)$/i;
const STOP = /^(stop|stop it|stop that|hold on|pause)[.!]?$/i;

/**
 * `armed`: Fitts was just woken by its name, so this utterance is for it even without "Fitts"
 * in front ("Fitts." … "check the search page").
 */
export function parseVoiceCommand(
  utterance: string,
  { armed = false }: { armed?: boolean } = {},
): VoiceCommand | null {
  const m = WAKE.exec(utterance);
  const rest = (m ? (m[2] ?? '') : armed ? utterance : '').trim();
  if (!m && !armed) return null;
  if (!rest) return m ? { kind: 'wake' } : null;
  if (STOP.test(rest)) return { kind: 'stop' };
  const text = rest.replace(/^[a-z]/, (c) => c.toUpperCase());
  return { kind: 'say', text };
}
