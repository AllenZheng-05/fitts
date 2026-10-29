import type { RunState } from '@fitts/schema';
import { useEffect, useRef } from 'react';
import { getEngine } from '../../state/engine';
import { MESSAGE_BOX_ID } from '../site-view/SiteView';

const isMod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

/**
 * Workspace shortcuts (SPEC §7.9): ⌘. stop current action · ⌘⇧P pause/resume · ⌘L focus
 * the message box. Esc never stops Fitts. There is no talk key: the mic is a button, or
 * "Fitts" with always-listening on.
 */
export function useWorkspaceShortcuts(run: RunState | undefined) {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
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
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  }, []);
}
