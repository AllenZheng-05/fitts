import { create } from 'zustand';

interface SpeechState {
  /** Fitts is speaking a line out loud: the avatar pulses (§5.4, §7.5). */
  speaking: boolean;
  /** The chat item being spoken right now, highlighted in the chat. */
  itemId: string | null;
}

export const useSpeech = create<SpeechState>(() => ({ speaking: false, itemId: null }));
