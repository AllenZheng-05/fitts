// Fitts's voice in Phase 1: the OS speechSynthesis (SPEC §2, §7.5).

/** Text as spoken: markdown bold markers removed. */
export const spokenText = (text: string) => text.replace(/\*\*/g, '');

/** Speaks `text` with the system voice. Calls `onEnd` when it finishes or fails. */
export function speak(text: string, onEnd?: () => void): void {
  const synth = globalThis.speechSynthesis as SpeechSynthesis | undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    onEnd?.();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(spokenText(text));
  utterance.rate = 1.02;
  if (onEnd) {
    utterance.onend = () => onEnd();
    utterance.onerror = () => onEnd();
  }
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  (globalThis.speechSynthesis as SpeechSynthesis | undefined)?.cancel();
}
