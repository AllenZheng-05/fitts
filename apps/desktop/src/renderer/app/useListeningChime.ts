import { useEffect } from 'react';
import { chime } from '../lib/chime';
import { useSettings } from '../state/settings';
import { useUi } from '../state/ui';

/**
 * Plays the chime when listening starts and stops (SPEC §7.5): holding to talk, and turning
 * "Always listening for 'Fitts'" on or off.
 */
export function useListeningChime() {
  useEffect(() => {
    const offMic = useUi.subscribe((s, prev) => {
      if (s.micListening !== prev.micListening) chime(s.micListening ? 'start' : 'stop');
    });
    const offMode = useSettings.subscribe((s, prev) => {
      if (s.talkMode === prev.talkMode) return;
      if (s.talkMode === 'wake') chime('start');
      else if (prev.talkMode === 'wake') chime('stop');
    });
    return () => {
      offMic();
      offMode();
    };
  }, []);
}
