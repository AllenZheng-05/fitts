// Fitts's voice (SPEC §2, §7.5; SPEC-phase2 §14). Phase 1's behavior stays: lines are spoken in
// order, the newest cuts off the old, the spoken item is highlighted and the avatar pulses.
// Only the backend changed: ElevenLabs through main when it's chosen and available, otherwise
// the OS voice (speechSynthesis).
import { useRunStore } from '../state/run-store';
import { useSettings } from '../state/settings';
import { useSpeech } from '../state/speech';
import { recordForTests } from './chime';
import { onBargeIn, speakLine, stopVoice, voiceBridge } from './voice/session';

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
  generation += 1;
  const mine = generation;
  (globalThis.speechSynthesis as SpeechSynthesis | undefined)?.cancel();
  stopVoice();
  useSpeech.setState({ speaking: false, itemId: null });
  for (const line of lines) recordForTests(`say:${spokenText(line.text)}`);
  if (useSettings.getState().voice === 'elevenlabs' && voiceBridge()) void sayEleven(lines, mine);
  else saySystem(lines, mine);
}

/** ElevenLabs, one line after another; the OS voice takes over if it isn't available. */
async function sayEleven(lines: SpokenLine[], mine: number): Promise<void> {
  const { voiceId } = useSettings.getState();
  const projectId = useRunStore.getState().activeProjectId;
  for (const [i, line] of lines.entries()) {
    if (mine !== generation) return;
    const played = await speakLine(spokenText(line.text), voiceId, projectId, () => {
      if (mine === generation) useSpeech.setState({ speaking: true, itemId: line.itemId ?? null });
    });
    if (played === null) return saySystem(lines.slice(i), mine);
    if (!played) return;
  }
  if (mine === generation) useSpeech.setState({ speaking: false, itemId: null });
}

function saySystem(lines: SpokenLine[], mine: number): void {
  const synth = globalThis.speechSynthesis as SpeechSynthesis | undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
  lines.forEach((line, i) => {
    const utterance = new SpeechSynthesisUtterance(spokenText(line.text));
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
  stopVoice();
}

// Barge-in (§14): when the mic hears the user start talking, Fitts stops.
onBargeIn(stopSpeaking);
