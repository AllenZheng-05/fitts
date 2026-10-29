import type { RunState } from '@fitts/schema';
import { useEffect, useRef } from 'react';
import { cannedTranscript } from '../../mock/voice';
import { sendFromComposer } from '../../state/actions';
import { useUi } from '../../state/ui';

/**
 * The mic button (§7.5): one tap starts listening, the next sends what was heard. Phase 1
 * has no speech-to-text, so the mock sends a canned transcript for the moment.
 */
export function useMicToggle(run: RunState | undefined) {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  return () => {
    const ui = useUi.getState();
    if (!ui.micListening) {
      ui.set({ micListening: true });
      return;
    }
    ui.set({ micListening: false });
    const current = runRef.current;
    if (current) sendFromComposer(current.projectId, cannedTranscript(current), { spoken: true });
  };
}
