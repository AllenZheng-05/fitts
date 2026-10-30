// Runs the deterministic probes (SPEC-phase2 §7) alongside the crawl and turns what they measure
// into ProbeResults with evidence ids. RealRun calls it at three points: a route's first visit
// (the page probes, Tab and the viewport sweep), after each action (feedback, errors, Fitts ID,
// back mid-flow), and when the crawl ends (links, network, label consistency).
import {
  feedbackTiming,
  fittsId,
  labelConsistency,
  networkProblems,
  PAGE_PROBES,
  type ActionTrace,
  type ForwardAction,
  type RequestRecord,
} from '@fitts/probes';
import type { ProbeItem, ProbeName, ProbeResult, SiteDevice } from '@fitts/schema';
import type { AxSnapshot } from '../protocol';
import type { ActionResult, Site } from '../site-client';
import { routeOf } from './coverage';

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

  constructor(
    private readonly site: Site,
    private readonly runId: string,
    private readonly onResult: (r: ProbeResult) => void,
  ) {}

  private add(
    probe: ProbeName,
    route: string,
    items: ProbeItem[],
    summary?: string,
    device?: SiteDevice,
  ): void {
    this.n += 1;
    const result: ProbeResult = {
      evidenceId: `${this.runId}-ev${this.n}`,
      probe,
      route,
      pass: items.length === 0,
      // Evidence says where it was measured: "28×20px on iPhone · 390×844".
      items: device
        ? items.map((i) => ({ ...i, measured: `${i.measured} on ${device.label}` }))
        : items,
      ...(summary ? { summary } : {}),
      ...(device ? { device: device.id } : {}),
    };
    this.results.push(result);
    this.onResult(result);
  }

  /** Every page the crawl sees: remember its labels and links; probe it on the first visit. */
  async onPage(snap: AxSnapshot): Promise<void> {
    const route = routeOf(snap.path);
    for (const n of snap.nodes) {
      if ((n.role === 'button' || n.role === 'link') && n.name && !this.labels.has(n.ref))
        this.labels.set(n.ref, { route, ref: n.ref, name: n.name });
      if (n.href && !this.hrefs.has(n.href)) this.hrefs.set(n.href, { route, ref: n.ref });
    }
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
  }

  /**
   * The phone pass: the page probes on a route already shown as a phone (RealRun switched the
   * device and navigated). Only problems the crawl's own pass didn't see are kept, so a finding
   * on a phone is something that goes wrong there.
   */
  async onDevice(route: string, device: SiteDevice): Promise<void> {
    const seen = new Set(
      this.results
        .filter((r) => r.route === route && !r.device)
        .flatMap((r) => r.items.map((i) => `${r.probe}|${i.ref}|${i.selector}`)),
    );
    const fresh = (probe: ProbeName, items: ProbeItem[]) =>
      items.filter((i) => !seen.has(`${probe}|${i.ref}|${i.selector}`));
    try {
      for (const r of await this.site.probes(PAGE_PROBES))
        if (r.probe !== 'font-inventory' && r.probe !== 'web-vitals')
          this.add(r.probe, route, fresh(r.probe, r.items), undefined, device);
    } catch {
      // A page that wouldn't load as a phone: the desktop pass still stands.
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
  }
}
