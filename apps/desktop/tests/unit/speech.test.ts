import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { say, stopSpeaking } from '../../src/renderer/lib/speech';
import { useSpeech } from '../../src/renderer/state/speech';

/** A stand-in for the OS voice: records utterances so a test can start and end them. */
class FakeUtterance {
  rate = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

describe('Fitts speaking (newest line wins, current line highlighted)', () => {
  let spoken: FakeUtterance[];
  const cancel = vi.fn();

  beforeEach(() => {
    spoken = [];
    cancel.mockClear();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', { speak: (u: FakeUtterance) => spoken.push(u), cancel });
  });
  afterEach(() => {
    stopSpeaking();
    vi.unstubAllGlobals();
  });

  it('cuts off the old line when a new one arrives, and ignores its late end', () => {
    say([{ text: 'Looking at **step 1**', itemId: 'a' }]);
    spoken[0]?.onstart?.();
    expect(useSpeech.getState()).toMatchObject({ speaking: true, itemId: 'a' });
    expect(spoken[0]?.text).toBe('Looking at step 1');

    say([{ text: 'Now step 2', itemId: 'b' }]);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(useSpeech.getState().itemId).toBeNull();

    // The cut-off line's error/end arrives after the new one started: no effect.
    spoken[1]?.onstart?.();
    spoken[0]?.onerror?.();
    expect(useSpeech.getState()).toMatchObject({ speaking: true, itemId: 'b' });
    spoken[1]?.onend?.();
    expect(useSpeech.getState()).toMatchObject({ speaking: false, itemId: null });
  });

  it('says lines from one moment in order, highlighting each as it plays', () => {
    say([
      { text: 'First', itemId: 'a' },
      { text: 'Second', itemId: 'b' },
    ]);
    spoken[0]?.onstart?.();
    expect(useSpeech.getState().itemId).toBe('a');
    spoken[0]?.onend?.();
    expect(useSpeech.getState().speaking).toBe(true);
    spoken[1]?.onstart?.();
    expect(useSpeech.getState().itemId).toBe('b');
    spoken[1]?.onend?.();
    expect(useSpeech.getState().speaking).toBe(false);
  });
});
