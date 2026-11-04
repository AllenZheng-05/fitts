// The coverage gate (SPEC-phase2 §6.1): a route isn't done until each of its primary controls
// has been exercised (or skipped with a reason); the run isn't done until every discovered route
// is done or skipped. It drives `controlsTried` and the site map's route status and label.
import type { RunState } from '@fitts/schema';
import type { AxNode, AxSnapshot } from '../protocol';

/** Names that put a click through the permission gate (§13): its writes are held. */
// "Cancel" alone usually dismisses a dialog; cancelling an order, a booking or a plan can't be
// undone (Nov 2: the Android order was cancelled with nothing held at the gate).
export const DESTRUCTIVE =
  /\b(delete|remove|pay|purchase|buy|checkout|transfer|unsubscribe|close account|cancel (?:my |the |this |your )?(?:order|plan|subscription|booking|reservation|appointment|membership))\b/i;

interface Control {
  /** The element it was last seen as (refs change when the page re-renders). */
  ref: string;
  name: string;
  role: string;
  type?: string;
  /** A same-page anchor link's href. */
  anchor?: string;
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
  /** SPEC-phase4 §6.2: the App Model named it (seeded at run start). */
  fromCode?: boolean;
  /** A link on some page points at it (else it's an orphan: "unlinked"). */
  linked?: boolean;
}

export type DiscoverHow = 'link' | 'visit' | 'code';

/** "/compose/recipient?x=1" → "/compose/recipient". Query strings don't make new routes. */
export const routeOf = (path: string) => (path.split(/[?#]/)[0] ?? '/').replace(/\/+$/, '') || '/';

/**
 * A route pattern from the code, not a page: a catch-all ("*", "/*", "/docs/*") or a parameter
 * with no value ("/menu/:id"). Opening one loads whatever the catch-all renders (Basil & Ember,
 * Nov 4: "/*" showed Home, never counted as visited, and the crawl kept going back to it).
 */
export const isPattern = (path: string) => /\*|%2a|(?:^|\/):[^/]/i.test(path);

/** A page as a person would recognize it: its title, headings and controls, in order. */
const pageOf = (snap: AxSnapshot) =>
  JSON.stringify([snap.title, snap.headings, snap.nodes.map((n) => [n.role, n.name])]);

/** Whether `path` is one of the owner's focus routes or under one ("/checkout/done"). */
const within = (path: string, focus: string[]) =>
  focus.some((f) => path === f || (f !== '/' && path.startsWith(`${f}/`)));

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

/** One control (by route, role and name) is tapped at most this often in a run, whatever its key. */
export const MAX_SAME_CONTROL = 3;

/** A control's tap count id: its route, role and name (its key, when it has no name). */
const tapId = (path: string, role: string, name: string, key: string) =>
  name ? `${routeOf(path)}|${role}|${name}` : `${routeOf(path)}|key|${key}`;

/** A link to a spot on the same page ("#main": a skip link): one try per run is enough. */
const isAnchor = (n: AxNode, path: string) => {
  if (!n.href || n.role !== 'link') return false;
  if (n.href.startsWith('#')) return true;
  const hash = n.href.indexOf('#');
  return hash > 0 && routeOf(n.href.slice(0, hash)) === routeOf(path);
};

export class Coverage {
  private readonly routes = new Map<string, Route>();
  /** A repeated card's controls, tried once anywhere: key → the route they were tried on. */
  private readonly triedCards = new Map<string, string>();
  /**
   * Taps per control by route, role and name: a key can change between snapshots (a skip link
   * whose classes change on focus), and Bootstrap's examples got 991 of 1,000 taps on one.
   */
  private readonly taps = new Map<string, number>();
  /** Same-page anchor links by name and href, tried once anywhere: → the route they were tried on. */
  private readonly triedAnchors = new Map<string, string>();
  /** Each page seen, as a person would recognize it → the first route that showed it. */
  private readonly pages = new Map<string, string>();
  /** The owner's pivot ("stay on checkout"): the routes the crawl keeps to until it's lifted. */
  private focusRoutes: string[] | undefined;
  private lifted: string[] | undefined;

  constructor(private readonly origin: string) {}

  /** The owner's pivot: the crawl keeps to these routes until lifted or covered. */
  focus(paths: string[]): void {
    const routes = [...new Set(paths.map(routeOf))].filter((p) => !isPattern(p));
    for (const p of routes) this.discover(p, 'visit');
    this.focusRoutes = routes.length ? routes : undefined;
  }

  unfocus(): void {
    this.focusRoutes = undefined;
  }

  /** The focus that was covered and lifted since the last call, once. */
  takeLifted(): string[] | undefined {
    const l = this.lifted;
    this.lifted = undefined;
    return l;
  }

  focused(): string[] | undefined {
    return this.focusRoutes;
  }

  /** The focus routes, and the routes under them, are all tried or skipped. */
  focusCovered(): boolean {
    const focus = this.focusRoutes;
    if (!focus) return false;
    return [...this.routes.values()]
      .filter((r) => within(r.path, focus))
      .every((r) => r.status === 'done' || (r.seen && this.routeDone(r.path)));
  }

  /** Inside the owner's focus, or no focus. */
  inFocus(path: string): boolean {
    return !this.focusRoutes || within(routeOf(path), this.focusRoutes);
  }

  /**
   * Adds a route to the queue (same origin only). Returns true when it's new. `how` says where
   * it came from (SPEC-phase4 §6.2): a link on a page, a visit, or the App Model's code.
   */
  discover(href: string, how: DiscoverHow = 'link'): boolean {
    let path: string;
    try {
      const u = new URL(href, this.origin);
      if (u.origin !== new URL(this.origin).origin) return false;
      path = routeOf(u.pathname);
    } catch {
      return false;
    }
    if (isPattern(path)) return false;
    const known = this.routes.get(path);
    if (known) {
      if (how === 'link') known.linked = true;
      if (how === 'code') known.fromCode = true;
      return false;
    }
    const route: Route = {
      path,
      status: 'queued',
      controls: new Map(),
      refs: new Map(),
      seen: false,
      issues: 0,
      ...(how === 'code' ? { fromCode: true } : {}),
      ...(how === 'link' ? { linked: true } : {}),
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
    this.discover(path, 'visit');
    const route = this.routes.get(path);
    if (!route) return;
    // The same page under another URL (a catch-all showing Home) is that page, visited.
    if (!route.seen) {
      const page = pageOf(snap);
      const first = this.pages.get(page);
      if (first && first !== path) {
        route.seen = true;
        route.status = 'done';
        route.label = `same page as ${first}`;
        return;
      }
      this.pages.set(page, path);
    }
    route.seen = true;
    for (const n of snap.nodes) {
      if (n.href && n.role === 'link') this.discover(n.href);
      if (isChrome(n)) continue;
      const key = n.key ?? n.ref;
      // A control that turned disabled (a stepper at its floor) waits until it's enabled again,
      // rather than being tapped to no effect (Basil & Ember's 0.1.0 crawl: 100+ taps).
      const known = route.controls.get(key);
      if (n.disabled) {
        if (known && !known.skipped) known.skipped = 'disabled';
        continue;
      }
      route.refs.set(n.ref, key);
      if (known) {
        known.ref = n.ref;
        if (known.skipped === 'disabled') delete known.skipped;
        continue;
      }
      const elsewhere = key.startsWith('card:')
        ? this.triedCards.get(key)
        : isAnchor(n, path)
          ? this.triedAnchors.get(`${n.name}|${n.href}`)
          : undefined;
      const worn = (this.taps.get(tapId(path, n.role, n.name, key)) ?? 0) >= MAX_SAME_CONTROL;
      route.controls.set(key, {
        ref: n.ref,
        name: n.name,
        role: n.role,
        ...(n.type ? { type: n.type } : {}),
        ...(isAnchor(n, path) && n.href ? { anchor: n.href } : {}),
        tried: false,
        ...(route.skipped
          ? { skipped: route.skipped }
          : elsewhere
            ? { skipped: `same as on ${elsewhere}` }
            : worn
              ? { skipped: `tapped ${MAX_SAME_CONTROL} times already` }
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
    const id = tapId(path, c.role, c.name, key ?? ref);
    this.taps.set(id, (this.taps.get(id) ?? 0) + 1);
    if (c.anchor && !this.triedAnchors.has(`${c.name}|${c.anchor}`))
      this.triedAnchors.set(`${c.name}|${c.anchor}`, routeOf(path));
    if (key?.startsWith('card:') && !this.triedCards.has(key))
      this.triedCards.set(key, routeOf(path));
  }

  /** Untries a control (and reopens its route), so the crawl uses it again. */
  retry(path: string, ref: string): void {
    const route = this.routes.get(routeOf(path));
    const c = this.control(path, ref);
    if (!route || !c) return;
    const id = tapId(path, c.role, c.name, route.refs.get(ref) ?? ref);
    if ((this.taps.get(id) ?? 0) >= MAX_SAME_CONTROL) return;
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
    // Outside the owner's focus, nothing here is tried: the crawl heads back (`nextRoute`).
    if (!route || !this.inFocus(path)) return [];
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
    // A covered focus lifts itself: the rest of the site comes back (`takeLifted` says so).
    if (this.focusRoutes && this.focusCovered()) {
      this.lifted = this.focusRoutes;
      this.focusRoutes = undefined;
    }
    const routes = [...this.routes.values()].filter((r) => this.inFocus(r.path));
    for (const r of routes) if (r.status !== 'done' && !this.routeDone(r.path)) return r.path;
    for (const r of routes) if (r.status !== 'done' && !r.seen) return r.path;
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

  /** SPEC-phase4 §6.2: the routes the code names, and whether the crawl reached each. */
  codeRoutes(): {
    path: string;
    seen: boolean;
    linked: boolean;
    skipped?: string;
    label?: string;
  }[] {
    return [...this.routes.values()]
      .filter((r) => r.fromCode)
      .map((r) => ({
        path: r.path,
        seen: r.seen,
        linked: Boolean(r.linked),
        ...(r.skipped ? { skipped: r.skipped } : {}),
        ...(r.label ? { label: r.label } : {}),
      }));
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
