// The coverage gate (SPEC-phase2 §6.1): a route isn't done until each of its primary controls
// has been exercised (or skipped with a reason); the run isn't done until every discovered route
// is done or skipped. It drives `controlsTried` and the site map's route status and label.
import type { RunState } from '@fitts/schema';
import type { AxNode, AxSnapshot } from '../protocol';

/** Names that put a click through the permission gate (§13): its writes are held. */
export const DESTRUCTIVE =
  /\b(delete|remove|pay|purchase|buy|checkout|transfer|unsubscribe|cancel plan|close account)\b/i;

interface Control {
  /** The element it was last seen as (refs change when the page re-renders). */
  ref: string;
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
  /** By key (AxNode.key, or the ref when there's none). */
  controls: Map<string, Control>;
  /** Ref → key, for the refs the crawler acts on. */
  refs: Map<string, string>;
  seen: boolean;
  issues: number;
  /** The owner skipped it: controls found there later are skipped too, and it stays done. */
  skipped?: string;
}

/** "/compose/recipient?x=1" → "/compose/recipient". Query strings don't make new routes. */
export const routeOf = (path: string) => (path.split(/[?#]/)[0] ?? '/').replace(/\/+$/, '') || '/';

const depthOf = (path: string) => Math.max(0, path.split('/').filter(Boolean).length - 1);

/**
 * A path segment that names one item, not a kind of page: "42", "a8f3k2x9", a uuid. Words
 * with a number ("step-2", "v2") are kinds of page, so they don't count.
 */
const ID_SEGMENT = /^\d+$|^(?=.*\d)(?=.*[a-z])[a-z0-9_]{6,}$|^[0-9a-f-]{16,}$/i;

/** "/team/abc123" → "/team/:id": pages that are one template with different data. */
export const patternOf = (path: string) =>
  path
    .split('/')
    .map((s) => (ID_SEGMENT.test(s) ? ':id' : s))
    .join('/');

/** Pages of one template tested before the rest count as the same page (Allen's feedback). */
export const SAME_TEMPLATE_PAGES = 2;

/**
 * Links in shared chrome (nav, header, footer) repeat on every page: they're for discovering
 * routes, not controls to test per route. Buttons there are real controls (demo/chat's Search,
 * Contacts and Settings are buttons in a nav).
 */
const isChrome = (n: AxNode) =>
  Boolean(n.href) && (n.region === 'nav' || n.region === 'header' || n.region === 'footer');

export class Coverage {
  private readonly routes = new Map<string, Route>();
  /** A repeated card's controls, tried once anywhere: key → the route they were tried on. */
  private readonly triedCards = new Map<string, string>();

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
    const route: Route = {
      path,
      status: 'queued',
      controls: new Map(),
      refs: new Map(),
      seen: false,
      issues: 0,
    };
    // A third page of the same template (/team/:id) isn't tested again: it's the same page.
    const pattern = patternOf(path);
    const like = [...this.routes.values()].filter((r) => patternOf(r.path) === pattern);
    if (pattern !== path && like.length >= SAME_TEMPLATE_PAGES) {
      route.status = 'done';
      route.seen = true;
      route.label = 'same page';
    }
    this.routes.set(path, route);
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
      const key = n.key ?? n.ref;
      route.refs.set(n.ref, key);
      const known = route.controls.get(key);
      if (known) {
        known.ref = n.ref;
        continue;
      }
      const elsewhere = key.startsWith('card:') ? this.triedCards.get(key) : undefined;
      route.controls.set(key, {
        ref: n.ref,
        name: n.name,
        role: n.role,
        ...(n.type ? { type: n.type } : {}),
        tried: false,
        ...(route.skipped
          ? { skipped: route.skipped }
          : elsewhere
            ? { skipped: `same as on ${elsewhere}` }
            : {}),
      });
    }
  }

  private control(path: string, ref: string): Control | undefined {
    const route = this.routes.get(routeOf(path));
    const key = route?.refs.get(ref) ?? ref;
    return route?.controls.get(key);
  }

  setStatus(path: string, status: Route['status'], label?: string): void {
    const route = this.routes.get(routeOf(path));
    if (!route || route.skipped) return;
    route.status = status;
    if (label === undefined) delete route.label;
    else route.label = label;
  }

  markTried(path: string, ref: string): void {
    const c = this.control(path, ref);
    if (!c) return;
    c.tried = true;
    const key = this.routes.get(routeOf(path))?.refs.get(ref);
    if (key?.startsWith('card:') && !this.triedCards.has(key))
      this.triedCards.set(key, routeOf(path));
  }

  /** Untries a control (and reopens its route), so the crawl uses it again. */
  retry(path: string, ref: string): void {
    const route = this.routes.get(routeOf(path));
    const c = this.control(path, ref);
    if (!route || !c) return;
    c.tried = false;
    if (route.status === 'done') {
      route.status = 'queued';
      delete route.label;
    }
  }

  skip(path: string, ref: string, reason: string): void {
    const c = this.control(path, ref);
    if (c) c.skipped = reason;
  }

  /** The owner skipped a page (SPEC-phase3 §1.4): what's left there is skipped, and it's done. */
  skipRoute(path: string, reason: string): void {
    this.discover(path);
    const route = this.routes.get(routeOf(path));
    if (!route) return;
    for (const c of route.controls.values()) if (!c.tried) c.skipped ??= reason;
    route.skipped = reason;
    route.seen = true;
    route.status = 'done';
    route.label = 'skipped';
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
    return [...route.controls.values()]
      .filter((c) => !c.tried && !c.skipped)
      .map((c) => ({
        ref: c.ref,
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

  /** Controls not yet tried or skipped, and on how many pages (for "I stopped at …"). */
  remaining(): { controls: number; routes: number } {
    let controls = 0;
    let routes = 0;
    for (const r of this.routes.values()) {
      const left = [...r.controls.values()].filter((c) => !c.tried && !c.skipped).length;
      const unseen = r.status !== 'done' && !r.seen;
      controls += left;
      if (left > 0 || unseen) routes += 1;
    }
    return { controls, routes };
  }

  /** stepEstimate (§6.1): routes × controls × 1.4 (no longer capped: big sites pass 200). */
  stepEstimate(): number {
    const routes = Math.max(1, this.routes.size);
    const perRoute = Math.max(1, this.controlsTried().total / routes);
    return Math.round(routes * perRoute * 1.4);
  }
}
