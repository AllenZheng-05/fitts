// Fitts's voice in Phase 1: the OS speechSynthesis (SPEC §2, §7.5).
import { useSpeech } from '../state/speech';
import { recordForTests } from './chime';

/** Text as spoken: markdown bold markers removed. */
export const spokenText = (text: string) => text.replace(/\*\*/g, '');

/** A line to say, and the chat item it belongs to (highlighted while it's spoken). */
export interface SpokenLine {
  text: string;
  itemId?: string;
}

/** Bumped on every interruption, so a cut-off line's late end/error events are ignored. */
let generation = 0;

/**
 * Says `lines` in order, cutting off whatever Fitts was still saying: once the run has moved
 * on, the old line is no longer about what's on screen. While a line is spoken, the speech
 * store holds its chat item id (the chat highlights it) and `speaking` is on, so the avatar
 * and the shapes pulse (§5.4, §6.12).
 */
export function say(lines: SpokenLine[]): void {
  if (lines.length === 0) return;
  const synth = globalThis.speechSynthesis as SpeechSynthesis | undefined;
  const supported = synth && typeof SpeechSynthesisUtterance !== 'undefined';
  generation += 1;
  const mine = generation;
  if (supported) synth.cancel();
  useSpeech.setState({ speaking: false, itemId: null });

  lines.forEach((line, i) => {
    const text = spokenText(line.text);
    recordForTests(`say:${text}`);
    if (!supported) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.onstart = () => {
      if (mine === generation) useSpeech.setState({ speaking: true, itemId: line.itemId ?? null });
    };
    const done = () => {
      if (mine === generation && i === lines.length - 1) {
        useSpeech.setState({ speaking: false, itemId: null });
      }
    };
    utterance.onend = done;
    utterance.onerror = done;
    synth.speak(utterance);
  });
}

/** Says one line, cutting off anything in progress. */
export function speak(text: string, itemId?: string): void {
  say([{ text, itemId }]);
}

export function stopSpeaking(): void {
  generation += 1;
  useSpeech.setState({ speaking: false, itemId: null });
  (globalThis.speechSynthesis as SpeechSynthesis | undefined)?.cancel();
}
