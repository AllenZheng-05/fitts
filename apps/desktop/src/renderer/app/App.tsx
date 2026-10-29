import { lazy, Suspense, useSyncExternalStore } from 'react';
import { ToastHost } from '../components/overlay/ToastHost';
import { copy } from '../copy';

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

/**
 * M2: dev builds open the run debug view (`#/gallery` for components); production shows
 * the scaffold page. The real router (Welcome / Workspace / Settings) arrives in M3.
 */
export function App() {
  const hash = useHash();
  const page =
    Gallery && hash === '#/gallery' ? (
      <Gallery />
    ) : RunDebug ? (
      <RunDebug />
    ) : (
      <main className="flex h-full flex-col items-center justify-center gap-2 bg-paper">
        <h1 className="font-display text-[68px] leading-[0.98] font-extrabold tracking-[-0.035em] text-ink">
          {copy.app.name}
        </h1>
        <p className="text-[13px] text-muted">{copy.app.scaffoldCaption}</p>
      </main>
    );

  return (
    <>
      <Suspense fallback={null}>
        {page}
        {ScenarioPanel && <ScenarioPanel />}
      </Suspense>
      <ToastHost />
    </>
  );
}
