import type { RunState } from '@fitts/schema';
import { useEffect, useRef } from 'react';
import { bridge } from '../../lib/bridge';
import { getEngine } from '../../state/engine';
import { useSettings } from '../../state/settings';
import { useUi } from '../../state/ui';
import { useHoldToTalk } from '../chat/useHoldToTalk';
import { MESSAGE_BOX_ID } from '../site-view/SiteView';

const isMod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

/**
 * Workspace shortcuts (SPEC §7.9): ⌘. stop current action · ⌘⇧P pause/resume · ⌘L focus
 * the message box · hold ⌥Space / Alt+Space to talk. Esc never stops Fitts.
 */
export function useWorkspaceShortcuts(run: RunState | undefined) {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  const mic = useHoldToTalk(run);
  const micRef = useRef(mic);
  useEffect(() => {
    micRef.current = mic;
  });

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const current = runRef.current;
      if (isMod(e) && !e.shiftKey && e.key === '.') {
        e.preventDefault();
        if (current?.phase === 'audit') getEngine().stopAction(current.projectId);
        return;
      }
      if (isMod(e) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (current?.phase !== 'audit') return;
        if (current.activity === 'paused') getEngine().resume(current.projectId);
        else getEngine().pause(current.projectId);
        return;
      }
      if (isMod(e) && !e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        document.getElementById(MESSAGE_BOX_ID)?.focus();
        return;
      }
    };
    // ⌥Space / Alt+Space arrives from main, which catches it before the OS (§7.9).
    const offHold = bridge().onHoldToTalk((state) => {
      if (useSettings.getState().talkMode === 'typing') return;
      if (state === 'down') micRef.current.start();
      else if (useUi.getState().micListening) micRef.current.end();
    });
    // Fallback: releasing Space or Alt always ends a hold, even if main missed the key-up.
    const onUp = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.key === 'Alt') && useUi.getState().micListening) {
        micRef.current.end();
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      offHold();
    };
  }, []);
}
