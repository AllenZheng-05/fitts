/** Whether a finding on `route` belongs to the site map row `path` (or a page under it). */
export function onRoute(route: string, path: string): boolean {
  if (path === '/') return route === '/';
  return route === path || route.startsWith(`${path}/`);
}
