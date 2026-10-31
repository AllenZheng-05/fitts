import type { RunState } from '@fitts/schema';
import { useEffect, useRef } from 'react';
import { beginDictation, dictate, endDictation } from '../../lib/voice/dictation';
import { bargeInNow, listen, type Listening } from '../../lib/voice/session';
import { TEST_BUILD } from '../../dev';
import { cannedTranscript } from '../../mock/voice';
import { useUi } from '../../state/ui';
import { MESSAGE_BOX_ID } from '../site-view/SiteView';

/**
 * The mic button (§7.5, SPEC-phase2 §14; Allen's feedback, round 4): one tap opens a Transcribe
 * session and the mic, and what you say is written into the message box as you say it; the next
 * tap ends it and leaves the words there to edit and send yourself. Typing in the box while
 * talking takes over: the mic stops and the box is yours. With no session (offline, no key, no
 * mic) the box gets the moment's canned transcript, as in Phase 1.
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
  // You started editing while talking: stop listening, keep the box as you left it.
  const takenOver = useUi((s) => s.micListening && s.dictationTakenOver);
  useEffect(() => {
    if (!takenOver) return;
    const s = session.current;
    session.current = null;
    if (s && s !== 'pending') s.cancel();
    useUi.getState().set({ micListening: false });
    endDictation();
  }, [takenOver]);

  const done = () => {
    endDictation();
    useUi.getState().set({ micFinishing: false });
    document.getElementById(MESSAGE_BOX_ID)?.focus();
  };
  return () => {
    const ui = useUi.getState();
    const current = runRef.current;
    if (!ui.micListening) {
      // You're about to talk: Fitts stops mid-sentence rather than talking over you.
      bargeInNow();
      beginDictation();
      ui.set({ micListening: true, dictationTakenOver: false });
      if (!current) return;
      session.current = 'pending';
      void listen('PUSH_TO_TALK', current.projectId, {
        partial: (text) => {
          if (!useUi.getState().dictationTakenOver) dictate(text);
        },
      }).then((l) => {
        if (session.current !== 'pending') return l?.cancel();
        session.current = l;
      });
      return;
    }
    ui.set({ micListening: false });
    const s = session.current;
    session.current = null;
    if (!current) return done();
    if (s && s !== 'pending') {
      ui.set({ micFinishing: true });
      void s.finish().then((text) => {
        if (text.trim()) dictate(text.trim());
        done();
      });
      return;
    }
    // No voice session (the mock engine): Phase 1's canned line, in dev and e2e builds only.
    if (TEST_BUILD) dictate(cannedTranscript(current));
    done();
  };
}
