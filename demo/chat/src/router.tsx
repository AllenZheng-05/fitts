import { useEffect, useState } from 'react';

const listeners = new Set<() => void>();

/** The app has moved at least once since it loaded (planted #32 tells fresh loads apart). */
let moved = false;
export const navigatedInApp = () => moved;

export function navigate(path: string): void {
  if (path === location.pathname) return;
  moved = true;
  history.pushState(null, '', path);
  for (const l of listeners) l();
}

export function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', update);
    };
  }, []);
  return path;
}
