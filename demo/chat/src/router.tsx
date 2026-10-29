import { useEffect, useState } from 'react';

const listeners = new Set<() => void>();

export function navigate(path: string): void {
  if (path === location.pathname) return;
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
