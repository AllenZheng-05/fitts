// Runs the deterministic probes (SPEC-phase2 §7) alongside the crawl and turns what they measure
// into ProbeResults with evidence ids. RealRun calls it at three points: a route's first visit
// (the page probes, Tab and the viewport sweep), after each action (feedback, errors, Fitts ID,
// back mid-flow), and when the crawl ends (links, network, label consistency).
import {
  brokenOnError,
  dialogProblems,
  faultLabel,
  keyboardProblems,
  movedBeforeTap,
  perfProblems,
  surpriseProblems,
  type FaultCase,
  type SurpriseEvent,
  type SurpriseNote,
  feedbackTiming,
  fittsId,
  labelConsistency,
  networkProblems,
  PAGE_PROBES,
  type ActionTrace,
  type ForwardAction,
  type RequestRecord,
} from '@fitts/probes';
import type { DeviceCell, ProbeItem, ProbeName, ProbeResult } from '@fitts/schema';
import type { AxSnapshot } from '../protocol';
import type { ActionResult, Site } from '../site-client';
import { routeOf } from './coverage';
import { backTrap, chainProblems, refreshProblem, soft404, wrongPlace } from './navigation';

/** Labels that submit or move a form on; "search" is not one (it's fine to run empty). */
const SUBMIT = /^(next|send|submit|save|create|add|continue|post|sign up|done)\b/i;
const BACKISH = /^(back|cancel|previous|go back|‹|←|close)\b/i;
const FIELD_ROLES = new Set(['textbox', 'combobox', 'searchbox']);

/** A Fitts ID above this for a primary action is hard to hit (bits). */
const HARD_ID = 4;

export class ProbeRunner {
  readonly results: ProbeResult[] = [];
  private n = 0;
  private readonly visited = new Set<string>();
  private readonly emptyTried = new Set<string>();
  private readonly backTried = new Set<string>();
  /** The last text typed on each route (for back-mid-flow). */
  private readonly typed = new Map<string, { ref: string; text: string }>();
  private readonly traces = new Map<string, ActionTrace[]>();
  private readonly requests: RequestRecord[] = [];
  private readonly forward: ForwardAction[] = [];
  private readonly labels = new Map<string, { route: string; ref: string; name: string }>();
  private readonly hrefs = new Map<string, { route: string; ref: string }>();
  private lastClick: { x: number; y: number } | null = null;
  /** SPEC-phase4 §6B: each control's link target; each route's headings when first seen. */
  private readonly hrefOf = new Map<string, string>();
  private readonly headingsOf = new Map<string, string[]>();
  private readonly dialogsChecked = new Set<string>();
  /** Surprise notes already made (first-load banners are reported once per site). */
  private readonly surprised = new Set<string>();
  /** The App Model says a page needs earlier steps (refresh problems there are notes only). */
  needsFlow: (route: string) => boolean = (route) => route.includes(':');
  /** The App Model says a page needs a login (a redirect to log in is expected there). */
  gated: (route: string) => boolean = () => false;

  constructor(
    private readonly site: Site,
    private readonly runId: string,
    private readonly onResult: (r: ProbeResult) => void,
    /**
     * SPEC-phase4 §6B.5: things that happened with nothing to prompt them (notes, not findings).
     * `clock`: add to a note's `at` for wall-clock ms (the frames' clock).
     */
    private readonly onSurprise: (
      route: string,
      notes: SurpriseNote[],
      clock?: number,
    ) => void = () => undefined,
  ) {}

  private add(
    probe: ProbeName,
    route: string,
    items: ProbeItem[],
    summary?: string,
    device?: { id: string },
  ): void {
    this.n += 1;
    const result: ProbeResult = {
      evidenceId: `${this.runId}-ev${this.n}`,
      probe,
      route,
      pass: items.length === 0,
      // The device goes on the result (the aggregator puts it in the evidence), never into
      // `measured`, which some finding titles quote.
      items,
      ...(summary ? { summary } : {}),
      ...(device ? { device: device.id } : {}),
    };
    this.results.push(result);
    this.onResult(result);
  }

  /** A page state's probe result (§6B.3), labeled with how the state was reached. */
  addState(
    r: { probe: ProbeName; items: ProbeItem[]; summary?: string | undefined },
    route: string,
    label: string,
  ): void {
    this.add(r.probe, route, r.items, r.summary ? `${label}: ${r.summary}` : label);
  }

  /** A route's headings when the crawl reached it (a fix's recheck compares against them). */
  headings(route: string): string[] {
    return this.headingsOf.get(route) ?? [];
  }

  /** Every page the crawl sees: remember its labels and links; probe it on the first visit. */
  async onPage(snap: AxSnapshot): Promise<void> {
    const route = routeOf(snap.path);
    for (const n of snap.nodes) {
      if ((n.role === 'button' || n.role === 'link') && n.name && !this.labels.has(n.ref))
        this.labels.set(n.ref, { route, ref: n.ref, name: n.name });
      if (n.href && !this.hrefs.has(n.href)) this.hrefs.set(n.href, { route, ref: n.ref });
      if (n.href) this.hrefOf.set(n.ref, n.href);
    }
    if (!this.headingsOf.has(route)) this.headingsOf.set(route, snap.headings);
    // A dialog open on the page: its keyboard rules, once per route (§6B.2).
    if (snap.nodes.some((n) => n.region === 'dialog') && !this.dialogsChecked.has(route)) {
      this.dialogsChecked.add(route);
      try {
        const d = await this.site.dialog?.();
        if (d) this.add('keyboard', route, dialogProblems(d));
      } catch {
        // Best effort.
      }
    }
    await this.surprise(route);
    if (this.visited.has(route)) return;
    this.visited.add(route);
    try {
      for (const r of await this.site.probes(PAGE_PROBES))
        this.add(r.probe, route, r.items, r.summary);
    } catch {
      // A page that navigated away mid-probe: the next visit tries again.
      this.visited.delete(route);
      return;
    }
    try {
      this.add('focus-visible', route, await this.site.focusSweep());
    } catch {
      // Best effort.
    }
    try {
      this.add('viewport-sweep', route, await this.site.viewportSweep());
    } catch {
      // Best effort.
    }
    // SPEC-phase4 §6B.2: a real Tab sweep: unreachable, stuck, hidden, order, skip link.
    try {
      const k = await this.site.keyboard?.();
      if (k) {
        const r = keyboardProblems({ stops: k.stops, ...k.facts });
        this.add(
          'keyboard',
          route,
          r.items,
          r.orderJumps >= 3
            ? `focus jumps back up the page ${r.orderJumps} times while tabbing`
            : undefined,
        );
      }
    } catch {
      // Best effort.
    }
  }

  /** SPEC-phase4 §6B.5: what the detector saw since the last look, judged against input times. */
  async surprise(route: string): Promise<void> {
    if (!this.site.surprise) return;
    try {
      const { events, inputs, clock } = await this.site.surprise();
      if (events.length === 0) return;
      // Each event belongs to the page it happened on (a tip that slides in late is read after
      // the next navigation in a single-page app).
      const byRoute = new Map<string, typeof events>();
      for (const e of events) {
        const where = e.path ? routeOf(e.path) : route;
        byRoute.set(where, [...(byRoute.get(where) ?? []), e]);
      }
      for (const [where, list] of byRoute) this.surpriseOn(where, list, inputs, clock);
    } catch {
      // Best effort.
    }
  }

  private surpriseOn(
    route: string,
    events: SurpriseEvent[],
    inputs: number[],
    clock: number | undefined,
  ): void {
    const r = surpriseProblems(events, inputs);
    if (r.items.length) this.add('surprise', route, r.items);
    const fresh = r.notes.filter((n) => {
      // A banner on first load is reported once per site, not per page.
      const key = `${n.kind}|${n.ref || n.measured.replace(/[\d.]+ s|\d+ px/g, '')}`;
      if (this.surprised.has(key)) return false;
      this.surprised.add(key);
      return true;
    });
    if (fresh.length) this.onSurprise(route, fresh, clock);
  }

  /**
   * The device pass (SPEC-phase4 §6.3): the cheap probes on a route already shown in a cell
   * (RealRun switched the cell and navigated): overflow and clipped text at the cell's width,
   * the cell's own check (text spacing, 200% text, landscape), contrast and target size. Only
   * problems the crawl's own pass (and earlier cells) didn't see are kept, so a finding in a cell
   * is something that goes wrong there.
   */
  async onCell(route: string, cell: DeviceCell): Promise<void> {
    if (!this.site.cellProbes) return;
    // Matched on what was measured, or on the element itself (its selector or source): refs are
    // re-issued when the page reloads, and a cell measures the same control differently (a 28 px
    // target is 31 px at wider text spacing), which isn't a new problem (Nov 2, bench:chat).
    const keys = (probe: ProbeName, i: ProbeItem) => [
      `${probe}|${i.measured}`,
      ...(i.selector ? [`${probe}|sel:${i.selector}`] : []),
      ...(i.src ? [`${probe}|src:${i.src}`] : []),
    ];
    const seen = new Set(
      this.results
        .filter((r) => r.route === route)
        .flatMap((r) => r.items.flatMap((i) => keys(r.probe, i))),
    );
    const fresh = (probe: ProbeName, items: ProbeItem[]) =>
      items.filter((i) => !keys(probe, i).some((k) => seen.has(k)));
    try {
      for (const r of await this.site.cellProbes(cell)) {
        const items = fresh(r.probe, r.items);
        if (items.length) this.add(r.probe, route, items, undefined, cell);
      }
    } catch {
      // A page that wouldn't load in this cell: the desktop pass still stands.
    }
  }

  /**
   * The error-message probe's own step: on a form's first visit, submit it empty (§7). Returns
   * the control to tap, or undefined.
   */
  emptySubmit(
    snap: AxSnapshot,
    untried: { ref: string; name: string }[],
  ): { ref: string; name: string } | undefined {
    const route = routeOf(snap.path);
    if (this.emptyTried.has(route)) return undefined;
    const fields = snap.nodes.filter((n) => FIELD_ROLES.has(n.role) && n.type !== 'search');
    if (fields.length === 0 || fields.some((f) => f.value)) return undefined;
    const submit = untried.find((c) => SUBMIT.test(c.name.trim()));
    if (!submit) return undefined;
    this.emptyTried.add(route);
    return submit;
  }

  /**
   * After a click or typing: feedback timing, error text, Fitts ID, back mid-flow. Returns true
   * when the action showed an error (the crawl tries that control again later, §7).
   */
  async afterAction(
    action: { kind: 'click' | 'type'; ref: string; name: string; text?: string },
    from: string,
    result: ActionResult,
  ): Promise<boolean> {
    const route = routeOf(from);
    const trace: ActionTrace = {
      ref: action.ref,
      name: action.name,
      kind: action.kind,
      feedback: result.trace?.feedback ?? null,
      navigated: result.navigated,
      ...(result.trace?.opened ? { opened: true } : {}),
      requests: result.trace?.requests ?? [],
      ...(action.kind === 'type' ? { chars: action.text?.length ?? 0 } : {}),
    };
    this.traces.set(route, [...(this.traces.get(route) ?? []), trace]);

    const timing = feedbackTiming(trace);
    if (timing.length) this.add('feedback-timing', route, timing);
    const errors = trace.feedback?.errors ?? [];
    if (errors.length) this.add('error-message', routeOf(result.path), errors);

    if (action.kind === 'type' && action.text)
      this.typed.set(route, { ref: action.ref, text: action.text });

    // SPEC-phase4 §6B.5: the target moved while Fitts reached for it.
    const moved = result.trace?.moved;
    if (action.kind === 'click' && moved) {
      const m = movedBeforeTap({ ref: action.ref, selector: '', name: action.name, ...moved });
      if (m) this.add('surprise', route, [m]);
    }
    // SPEC-phase4 §6B.4: where it went vs where its link says, and the redirects on the way.
    if (action.kind === 'click') {
      const expected = this.hrefOf.get(action.ref);
      const arrived = routeOf(result.path);
      const hops = result.trace?.redirects ?? [];
      const w = wrongPlace({
        ref: action.ref,
        name: action.name,
        ...(expected ? { expected: new URL(expected, 'http://x').pathname } : {}),
        arrived,
        redirects: hops,
      });
      if (w) this.add('navigation', route, [w]);
      if (hops.length) {
        const from = expected ? new URL(expected, 'http://x').pathname : route;
        const chain = chainProblems({ from, hops, gated: this.gated(from) });
        if (chain.length)
          this.add(
            'navigation',
            route,
            chain.map((c) => ({ ...c, ref: action.ref })),
          );
        // Back once after a redirect: sent straight forward again is a trap.
        try {
          const back = await this.site.back();
          const trap = backTrap({ redirectedFrom: from, afterBack: back.path, arrived });
          if (trap) this.add('navigation', route, [{ ...trap, ref: action.ref }]);
          if (routeOf(back.path) !== arrived) await this.site.navigate(arrived);
        } catch {
          // Best effort.
        }
      }
    }
    await this.surprise(routeOf(result.path));

    const rect = result.trace?.rect;
    if (action.kind === 'click' && rect) {
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const primary = result.navigated || SUBMIT.test(action.name.trim());
      if (this.lastClick && primary) {
        const d = Math.hypot(x - this.lastClick.x, y - this.lastClick.y);
        const w = Math.min(rect.width, rect.height);
        const id = fittsId(d, w);
        if (id > HARD_ID)
          this.add('fitts-id', route, [
            {
              ref: action.ref,
              selector: '',
              measured: `ID ${id.toFixed(1)} bits (${Math.round(d)}px away, ${Math.round(w)}px wide)`,
              expected: `at most ${HARD_ID} bits for a main action`,
            },
          ]);
      }
      this.lastClick = { x, y };
    }

    if (action.kind === 'click' && result.navigated) {
      const to = routeOf(result.path);
      this.forward.push({ route, ref: action.ref, name: action.name, to });
      await this.backMidFlow(route, to);
    }
    return errors.length > 0;
  }

  /**
   * Back mid-flow (H3): after moving on from a page where something was typed, check for a
   * back or cancel control, press the browser's back, and see whether the text survived.
   */
  private async backMidFlow(from: string, to: string): Promise<void> {
    const typed = this.typed.get(from);
    if (!typed || this.backTried.has(from) || to === '/' || to === from) return;
    this.backTried.add(from);
    const items: ProbeItem[] = [];
    try {
      const there = await this.site.snapshot();
      if (!there.nodes.some((n) => BACKISH.test(n.name.trim())))
        items.push({
          ref: '',
          selector: '',
          measured: `no back or cancel control on ${to}`,
          expected: 'a visible way back that keeps what was entered',
        });
      await this.site.back();
      const value = await this.site.value(typed.ref);
      if (value !== null && value !== typed.text)
        items.push({
          ref: typed.ref,
          selector: '',
          measured: value
            ? `after Back the field shows "${value.slice(0, 40)}"`
            : 'after Back, what was typed is gone',
          expected: 'what was typed is still there',
        });
    } catch {
      return;
    }
    this.add('back-mid-flow', from, items);
  }

  /** When the crawl ends: links, network and label consistency over the whole site. */
  async finish(): Promise<void> {
    try {
      this.requests.push(...(await this.site.network()));
    } catch {
      // Best effort.
    }
    const routes = new Set([...this.visited, ...this.traces.keys()]);
    for (const route of routes) {
      const items = networkProblems(
        this.requests.filter((r) => r.route === route),
        this.traces.get(route) ?? [],
      );
      this.add('network', route, items);
    }

    try {
      const statuses = await this.site.links([...this.hrefs.keys()]);
      const byRoute = new Map<string, ProbeItem[]>();
      for (const [href, status] of Object.entries(statuses)) {
        const where = this.hrefs.get(href);
        if (!where || (status > 0 && status < 400)) continue;
        byRoute.set(where.route, [
          ...(byRoute.get(where.route) ?? []),
          {
            ref: where.ref,
            selector: '',
            measured: status ? `${href} returns ${status}` : `${href} doesn't load`,
            expected: 'a page that loads',
          },
        ]);
      }
      for (const route of this.visited) this.add('links', route, byRoute.get(route) ?? []);
    } catch {
      // Best effort.
    }

    const label = labelConsistency(this.forward, [...this.labels.values()]);
    const first = label[0]?.ref;
    const where =
      this.forward.find((f) => f.ref === first)?.route ?? this.labels.get(first ?? '')?.route;
    this.add('label-consistency', where ?? '/', label);
    await this.freshLoads();
  }

  /**
   * SPEC-phase4 §6B.4: every reached route loaded fresh once (a refresh or a deep link), and an
   * address that can't exist, to see whether it says so.
   */
  private async freshLoads(): Promise<void> {
    if (!this.site.facts) return;
    for (const route of this.visited) {
      try {
        const f = await this.site.facts(route);
        const p = refreshProblem({
          route,
          status: f.status,
          mainText: f.mainText,
          ...(f.errorText ? { errorText: f.errorText } : {}),
          headings: f.headings,
          expectedHeadings: this.headingsOf.get(route) ?? [],
          needsFlow: this.needsFlow(route),
        });
        if (p) this.add('navigation', route, [p]);
      } catch {
        // Best effort.
      }
    }
    try {
      const path = `/fitts-not-a-page-${Math.random().toString(36).slice(2, 8)}`;
      const f = await this.site.facts(path);
      const s = soft404({
        path,
        status: f.status,
        headings: f.headings,
        homeHeadings: this.headingsOf.get('/') ?? [],
        text: f.text,
      });
      if (s) this.add('navigation', '/', [s]);
    } catch {
      // Best effort.
    }
  }

  /**
   * SPEC-phase4 §6B.6, state_pass: up to 6 of the site's own GET endpoints (most used first),
   * each page that uses one loaded with it empty, failing and slow. Local projects only.
   */
  async statePass(
    origin: string,
    onState: (s: { route: string; label: string; jpegBase64?: string }) => void,
  ): Promise<void> {
    if (!this.site.fault) return;
    const own = this.requests.filter((r) => {
      if (r.method.toUpperCase() !== 'GET' || (r.type !== 'Fetch' && r.type !== 'XHR'))
        return false;
      try {
        return new URL(r.url).origin === new URL(origin).origin;
      } catch {
        return false;
      }
    });
    const uses = new Map<string, { n: number; route: string }>();
    for (const r of own) {
      const endpoint = new URL(r.url).pathname;
      const u = uses.get(endpoint) ?? { n: 0, route: r.route };
      uses.set(endpoint, { n: u.n + 1, route: u.route });
    }
    const top = [...uses.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6);
    for (const [endpoint, { route }] of top) {
      for (const fault of ['error', 'empty', 'slow'] as FaultCase[]) {
        try {
          const r = await this.site.fault(route, endpoint, fault);
          // The page never asked (a search asks only when you type): it showed its normal state,
          // which says nothing about this case (bench:chat, Nov 2: "/search goes blank").
          if (r.hit === false) continue;
          const label = faultLabel(fault, endpoint);
          onState({ route, label, ...(r.jpegBase64 ? { jpegBase64: r.jpegBase64 } : {}) });
          const items: ProbeItem[] = [];
          if (fault === 'error') {
            const broken = brokenOnError({
              mainText: r.facts.mainText,
              ...(r.facts.errorText ? { errorText: r.facts.errorText } : {}),
              uncaught: r.uncaught,
            });
            if (broken)
              items.push({
                ref: '',
                selector: 'main',
                measured: `${route} ${broken} ${label}`,
                expected: 'says what went wrong, with a way to try again',
              });
          }
          if (fault === 'slow' && !r.busyWithin1s)
            items.push({
              ref: '',
              selector: 'main',
              measured: `no sign ${route} is loading ${label}`,
              expected: 'a loading indicator within 1 s',
            });
          if (items.length) this.add('state', route, items);
          for (const res of r.results)
            if (!res.pass) this.add(res.probe, route, res.items, `${label}`);
        } catch {
          // Best effort: the next case.
        }
      }
    }
  }

  /** SPEC-phase4 §6B.7, perf_pass: throttled phone numbers, journey pages first. */
  async perfPass(routes: string[]): Promise<void> {
    if (!this.site.perf) return;
    try {
      for (const page of await this.site.perf(routes))
        this.add(
          'perf',
          page.route,
          perfProblems(page).map((p) => ({
            ref: '',
            selector: '',
            measured: p.measured,
            expected: p.expected,
          })),
        );
    } catch {
      // Best effort.
    }
  }
}
