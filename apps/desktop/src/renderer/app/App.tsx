import { lazy, Suspense, useSyncExternalStore } from 'react';
import { ToastHost } from '../components/overlay/ToastHost';
import { copy } from '../copy';

// Removed from production builds: __FITTS_DEV_TOOLS__ is false there.
const Gallery = __FITTS_DEV_TOOLS__
  ? lazy(() => import('../features/gallery/Gallery').then((m) => ({ default: m.Gallery })))
  : null;

const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const useHash = () => useSyncExternalStore(subscribeHash, () => window.location.hash);

/** M1: the scaffold page plus the dev-only `#/gallery`. The real router arrives in M3. */
export function App() {
  const hash = useHash();
  return (
    <>
      {Gallery && hash === '#/gallery' ? (
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
      ) : (
        <main className="flex h-full flex-col items-center justify-center gap-2 bg-paper">
          <h1 className="font-display text-[68px] leading-[0.98] font-extrabold tracking-[-0.035em] text-ink">
            {copy.app.name}
          </h1>
          <p className="text-[13px] text-muted">{copy.app.scaffoldCaption}</p>
        </main>
      )}
      <ToastHost />
    </>
  );
}
