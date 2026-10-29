import type { RunState } from '@fitts/schema';
import { useEffect, useRef } from 'react';
import { cannedTranscript } from '../../mock/voice';
import { sendFromComposer } from '../../state/actions';
import { useUi } from '../../state/ui';

/** Starts and ends hold-to-talk; the mock sends a canned transcript on release (§7.5). */
export function useHoldToTalk(run: RunState | undefined) {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  return {
    start: () => {
      if (useUi.getState().micListening) return;
      useUi.getState().set({ micListening: true });
    },
    end: () => {
      if (!useUi.getState().micListening) return;
      useUi.getState().set({ micListening: false });
      const current = runRef.current;
      if (current) sendFromComposer(current.projectId, cannedTranscript(current), { spoken: true });
    },
  };
}
