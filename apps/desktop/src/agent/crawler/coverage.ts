// The coverage gate (SPEC-phase2 §6.1): a route isn't done until each of its primary controls
// has been exercised (or skipped with a reason); the run isn't done until every discovered route
// is done or skipped. It drives `controlsTried` and the site map's route status and label.
import type { RunState } from '@fitts/schema';
import type { AxNode, AxSnapshot } from '../protocol';

/** Names that put a click through the permission gate (§13): its writes are held. */
export const DESTRUCTIVE =
  /\b(delete|remove|pay|purchase|buy|checkout|transfer|unsubscribe|cancel plan|close account)\b/i;

interface Control {
  name: string;
  role: string;
  type?: string;
  tried: boolean;
  skipped?: string;
}

interface Route {
  path: string;
  status: 'queued' | 'testing' | 'done';
  label?: string;
  controls: Map<string, Control>;
  seen: boolean;
  issues: number;
}

/** "/compose/recipient?x=1" → "/compose/recipient". Query strings don't make new routes. */
export const routeOf = (path: string) => (path.split(/[?#]/)[0] ?? '/').replace(/\/+$/, '') || '/';

const depthOf = (path: string) => Math.max(0, path.split('/').filter(Boolean).length - 1);

/**
 * Links in shared chrome (nav, header, footer) repeat on every page: they're for discovering
 * routes, not controls to test per route. Buttons there are real controls (demo/chat's Search,
 * Contacts and Settings are buttons in a nav).
 */
const isChrome = (n: AxNode) =>
  Boolean(n.href) && (n.region === 'nav' || n.region === 'header' || n.region === 'footer');

export class Coverage {
  private readonly routes = new Map<string, Route>();

  constructor(private readonly origin: string) {}

  /** Adds a route to the queue (same origin only). Returns true when it's new. */
  discover(href: string): boolean {
    let path: string;
    try {
      const u = new URL(href, this.origin);
      if (u.origin !== new URL(this.origin).origin) return false;
      path = routeOf(u.pathname);
    } catch {
      return false;
    }
    if (this.routes.has(path)) return false;
    this.routes.set(path, { path, status: 'queued', controls: new Map(), seen: false, issues: 0 });
    return true;
  }

  /** Records what's on the page: its controls (for its route) and links to other routes. */
  observe(snap: AxSnapshot): void {
    const path = routeOf(snap.path);
    this.discover(path);
    const route = this.routes.get(path);
    if (!route) return;
    route.seen = true;
    for (const n of snap.nodes) {
      if (n.href && n.role === 'link') this.discover(n.href);
      if (n.disabled || isChrome(n)) continue;
      if (route.controls.has(n.ref)) continue;
      route.controls.set(n.ref, {
        name: n.name,
        role: n.role,
        ...(n.type ? { type: n.type } : {}),
        tried: false,
      });
    }
  }

  setStatus(path: string, status: Route['status'], label?: string): void {
    const route = this.routes.get(routeOf(path));
    if (!route) return;
    route.status = status;
    if (label === undefined) delete route.label;
    else route.label = label;
  }

  markTried(path: string, ref: string): void {
    const c = this.routes.get(routeOf(path))?.controls.get(ref);
    if (c) c.tried = true;
  }

  /** Untries a control (and reopens its route), so the crawl uses it again. */
  retry(path: string, ref: string): void {
    const route = this.routes.get(routeOf(path));
    const c = route?.controls.get(ref);
    if (!route || !c) return;
    c.tried = false;
    if (route.status === 'done') {
      route.status = 'queued';
      delete route.label;
    }
  }

  skip(path: string, ref: string, reason: string): void {
    const c = this.routes.get(routeOf(path))?.controls.get(ref);
    if (c) c.skipped = reason;
  }

  /** Every control on the route is tried or skipped (or the route was never reachable). */
  routeDone(path: string): boolean {
    const route = this.routes.get(routeOf(path));
    if (!route) return true;
    return route.seen && [...route.controls.values()].every((c) => c.tried || c.skipped);
  }

  untried(path: string): { ref: string; name: string; role: string; type?: string }[] {
    const route = this.routes.get(routeOf(path));
    if (!route) return [];
    return [...route.controls]
      .filter(([, c]) => !c.tried && !c.skipped)
      .map(([ref, c]) => ({
        ref,
        name: c.name,
        role: c.role,
        ...(c.type ? { type: c.type } : {}),
      }));
  }

  /** The next route that still needs work, in discovery order. */
  nextRoute(): string | undefined {
    for (const r of this.routes.values())
      if (r.status !== 'done' && !this.routeDone(r.path)) return r.path;
    for (const r of this.routes.values()) if (r.status !== 'done' && !r.seen) return r.path;
    return undefined;
  }

  complete(): boolean {
    return [...this.routes.values()].every((r) => r.status === 'done' || this.routeDone(r.path));
  }

  controlsTried(): RunState['controlsTried'] {
    let done = 0;
    let total = 0;
    for (const r of this.routes.values()) {
      for (const c of r.controls.values()) {
        total += 1;
        if (c.tried || c.skipped) done += 1;
      }
    }
    return { done, total };
  }

  /** The site map's rows (§6.4), children after their parent. */
  stateRoutes(): RunState['routes'] {
    const list = [...this.routes.values()].sort((a, b) => a.path.localeCompare(b.path));
    return list.map((r) => ({
      path: r.path,
      depth: depthOf(r.path),
      status: r.status,
      issues: r.issues,
      ...(r.label ? { label: r.label } : {}),
    }));
  }

  /** stepEstimate (§6.1): routes × controls × 1.4, capped at 200. */
  stepEstimate(): number {
    const routes = Math.max(1, this.routes.size);
    const perRoute = Math.max(1, this.controlsTried().total / routes);
    return Math.min(200, Math.round(routes * perRoute * 1.4));
  }
}
