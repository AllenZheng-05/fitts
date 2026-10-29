// Fitts's voice in Phase 1: the OS speechSynthesis (SPEC §2, §7.5).
import { useSpeech } from '../state/speech';
import { recordForTests } from './chime';

/** Text as spoken: markdown bold markers removed. */
export const spokenText = (text: string) => text.replace(/\*\*/g, '');

let active = 0;

/**
 * Speaks `text` with the system voice. While anything is being spoken the speech store's
 * `speaking` flag is on, so the avatar (and the shapes) pulse (§5.4, §6.12).
 */
export function speak(text: string): void {
  const line = spokenText(text);
  recordForTests(`say:${line}`);
  const synth = globalThis.speechSynthesis as SpeechSynthesis | undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
  const utterance = new SpeechSynthesisUtterance(line);
  utterance.rate = 1.02;
  const done = () => {
    active = Math.max(0, active - 1);
    if (active === 0) useSpeech.setState({ speaking: false });
  };
  utterance.onstart = () => useSpeech.setState({ speaking: true });
  utterance.onend = done;
  utterance.onerror = done;
  active += 1;
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  active = 0;
  useSpeech.setState({ speaking: false });
  (globalThis.speechSynthesis as SpeechSynthesis | undefined)?.cancel();
}
