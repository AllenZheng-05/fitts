import type { RunState } from '@fitts/schema';
import { useEffect, useRef } from 'react';
import { listen, type Listening } from '../../lib/voice/session';
import { TEST_BUILD } from '../../dev';
import { cannedTranscript } from '../../mock/voice';
import { sendFromComposer } from '../../state/actions';
import { useUi } from '../../state/ui';

/**
 * The mic button (§7.5, SPEC-phase2 §14): one tap opens a Transcribe session and the mic, and
 * partials show in the message box; the next tap ends it and sends the final text, spoken. With
 * no session (offline, no key, no mic) it sends the moment's canned transcript, as in Phase 1.
 */
export function useMicToggle(run: RunState | undefined) {
  const runRef = useRef(run);
  const session = useRef<Listening | 'pending' | null>(null);
  useEffect(() => {
    runRef.current = run;
  });
  useEffect(
    () => () => {
      const s = session.current;
      if (s && s !== 'pending') s.cancel();
    },
    [],
  );
  return () => {
    const ui = useUi.getState();
    const current = runRef.current;
    if (!ui.micListening) {
      ui.set({ micListening: true, micPartial: '' });
      if (!current) return;
      session.current = 'pending';
      void listen('PUSH_TO_TALK', current.projectId, {
        partial: (text) => useUi.getState().set({ micPartial: text }),
      }).then((l) => {
        if (session.current !== 'pending') return l?.cancel();
        session.current = l;
      });
      return;
    }
    ui.set({ micListening: false });
    const s = session.current;
    session.current = null;
    if (!current) return;
    if (s && s !== 'pending') {
      ui.set({ micFinishing: true });
      void s.finish().then((text) => {
        useUi.getState().set({ micPartial: '', micFinishing: false });
        if (text.trim()) sendFromComposer(current.projectId, text.trim(), { spoken: true });
      });
      return;
    }
    useUi.getState().set({ micPartial: '' });
    // No voice session (the mock engine): Phase 1's canned line, in dev and e2e builds only.
    if (TEST_BUILD)
      sendFromComposer(current.projectId, cannedTranscript(current), { spoken: true });
  };
}
