import { lazy, Suspense, useSyncExternalStore } from 'react';
import { ToastHost } from '../components/overlay/ToastHost';
import { Background } from '../features/background/Background';
import { AddProjectDialog } from '../features/projects/AddProjectDialog';
import { PauseConfirm } from '../features/projects/PauseConfirm';
import { Settings } from '../features/settings/Settings';
import { Welcome } from '../features/welcome/Welcome';
import { Workspace } from '../features/workspace/Workspace';
import { useUi } from '../state/ui';
import { useBackgroundNotifications } from './useBackgroundNotifications';
import { useListeningChime } from './useListeningChime';
import { useShortcuts } from './useShortcuts';

// Dev tools are removed from production builds: __FITTS_DEV_TOOLS__ is false there.
const Gallery = __FITTS_DEV_TOOLS__
  ? lazy(() => import('../features/gallery/Gallery').then((m) => ({ default: m.Gallery })))
  : null;
const RunDebug = __FITTS_DEV_TOOLS__
  ? lazy(() => import('../features/debug/RunDebug').then((m) => ({ default: m.RunDebug })))
  : null;
const ScenarioPanel = __FITTS_DEV_TOOLS__
  ? lazy(() =>
      import('../features/scenario-panel/ScenarioPanel').then((m) => ({
        default: m.ScenarioPanel,
      })),
    )
  : null;

const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const useHash = () => useSyncExternalStore(subscribeHash, () => window.location.hash);

/** Routes between Welcome, Workspace and Settings (SPEC §4). Dev builds add #/gallery and #/debug. */
export function App() {
  useShortcuts();
  useBackgroundNotifications();
  useListeningChime();
  const hash = useHash();
  const screen = useUi((s) => s.screen);

  let page;
  if (Gallery && hash === '#/gallery') page = <Gallery />;
  else if (RunDebug && hash === '#/debug') page = <RunDebug />;
  else if (screen === 'settings') page = <Settings />;
  else if (screen === 'workspace') page = <Workspace />;
  else page = <Welcome />;

  return (
    <>
      <Background />
      {/* The page sits above the fixed shape field (z-0). Separate Suspense boundaries:
          the page never waits for the dev panel's code to load. */}
      <div className="relative z-[1] h-full">
        <Suspense fallback={null}>{page}</Suspense>
      </div>
      {ScenarioPanel && (
        <Suspense fallback={null}>
          <ScenarioPanel />
        </Suspense>
      )}
      <AddProjectDialog />
      <PauseConfirm />
      <ToastHost />
    </>
  );
}
