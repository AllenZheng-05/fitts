// Surprises on Android (A10, Nov 2): from the hierarchy dumps the audit already takes, what moved
// or appeared with nothing to prompt it. Two dumps of the same screen are compared:
// - jumped: an element with an id (testID or resource-id) moved more than 24dp, with no input
//   between the two dumps;
// - popped up: a new dialog, sheet or overlay (by its class or id, or covering a quarter of the
//   screen) that appeared with no input for 1 s.
// They come out as the web detector's events (same shapes, Fitts's clock), so the agent's
// analysis, notes, judge and frames treat them the same. Pure.
import { flatten, sayable, spoken, type AndroidNode, type SurpriseEvent } from '@fitts/probes';

export interface Dump {
  root: AndroidNode;
  /** When it was taken (ms on the window's clock). */
  at: number;
}

const JUMP_DP = 24;
const OVERLAY = /Dialog|Sheet|Modal|PopupWindow|Toast|Snackbar/i;
const OVERLAY_ID = /dialog|sheet|modal|popup|overlay|toast|snackbar/i;

/** Elements with an id of their own (an a<n> ref is only stable within one dump). */
const byRef = (root: AndroidNode) => {
  const out = new Map<string, AndroidNode>();
  for (const n of flatten(root)) if (!/^a\d+$/.test(n.ref) && n.ref !== 'root') out.set(n.ref, n);
  return out;
};

const short = (cls: string) => cls.split('.').pop() ?? cls;

export function diffDumps(
  prev: Dump,
  next: Dump,
  inputs: number[],
  opts: { density: number; screen: { width: number; height: number }; path: string },
): SurpriseEvent[] {
  const events: SurpriseEvent[] = [];
  const dp = (px: number) => px / (opts.density / 160);
  const before = byRef(prev.root);
  const after = byRef(next.root);
  const inputBetween = inputs.some((t) => t > prev.at && t <= next.at);
  // The move happened somewhere between the dumps: its midpoint, when they're close.
  const at = next.at - prev.at < 2000 ? Math.round((prev.at + next.at) / 2) : next.at - 500;

  const moved = [...after.values()]
    .map((n) => ({ n, was: before.get(n.ref) }))
    .filter((x): x is { n: AndroidNode; was: AndroidNode } => x.was !== undefined)
    .filter((x) => Math.abs(dp(x.n.bounds.y - x.was.bounds.y)) > JUMP_DP)
    .sort(
      (a, b) => Math.abs(b.n.bounds.y - b.was.bounds.y) - Math.abs(a.n.bounds.y - a.was.bounds.y),
    );
  if (moved.length)
    events.push({
      type: 'shift',
      at,
      hadRecentInput: inputBetween,
      // The clickable ones first: what a tap was about to land on.
      sources: [...moved.filter((x) => x.n.clickable), ...moved.filter((x) => !x.n.clickable)]
        .slice(0, 4)
        .map(({ n, was }) => ({
          ref: n.ref,
          selector: short(n.cls),
          name: sayable(spoken(n)).slice(0, 60),
          fromY: was.bounds.y,
          toY: n.bounds.y,
        })),
      path: opts.path,
    });

  const area = opts.screen.width * opts.screen.height;
  for (const n of after.values()) {
    if (before.has(n.ref)) continue;
    const coverage = (n.bounds.w * n.bounds.h) / Math.max(1, area);
    const dialog = OVERLAY.test(n.cls) || OVERLAY_ID.test(n.ref);
    if (!dialog && coverage < 0.25) continue;
    events.push({
      type: 'added',
      at,
      ref: n.ref,
      selector: short(n.cls),
      name: sayable(spoken(n)).slice(0, 60),
      role: dialog ? 'dialog' : '',
      fixed: true,
      zIndex: dialog ? 1000 : 0,
      coverage: Math.round(coverage * 100) / 100,
      path: opts.path,
    });
  }
  // Whether a pop-up was an input's answer is the agent's call, from the input times (as on the
  // web: more than 1 s with none is a surprise; a dialog a beat later goes to the judge).
  return events;
}
