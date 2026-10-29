import { useEffect } from 'react';
import { useOverlayStack } from '../state/overlays';
import { useUi } from '../state/ui';

const isMod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

/**
 * App-wide shortcuts (SPEC §7.9): ⌘, Settings · ⌘P project menu · Esc leaves Settings when
 * no overlay is open. Run shortcuts (⌘. ⌘⇧P ⌘L, hold-to-talk) live in the workspace.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      if (isMod(e) && !e.shiftKey && !e.altKey && e.key === ',') {
        e.preventDefault();
        ui.openSettings();
        return;
      }
      if (isMod(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (ui.screen === 'workspace') ui.set({ projectMenuOpen: !ui.projectMenuOpen });
        return;
      }
      if (e.key === 'Escape' && ui.screen === 'settings') {
        // Esc only closes the topmost overlay; with none open it leaves Settings (§6.13).
        if (useOverlayStack.getState().stack.length > 0 || e.defaultPrevented) return;
        ui.closeSettings();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
