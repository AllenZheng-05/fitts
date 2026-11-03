// Keyboard (SPEC-phase4 §6B.2): what a real Tab sweep shows. The site window presses Tab up
// to 200 times and records each stop (the element, its box, how much of it is visible, whether
// it's inside a dialog); this turns the sequence into problems. Pure, unit-tested.
import type { ProbeItem } from '@fitts/schema';

export interface TabStop {
  ref: string;
  selector: string;
  name: string;
  rect: { x: number; y: number; width: number; height: number };
  /** Share of the box a person can see (0–1): offscreen or under a sticky header lowers it. */
  visible: number;
}

export interface KeyboardInput {
  stops: TabStop[];
  /** The page's interactive elements (from the snapshot) that are visible and enabled. */
  interactive: { ref: string; selector: string; name: string }[];
  /** Links in the page's nav (a skip link matters from 6). */
  navLinks: number;
  /** The first Tab stop is a "skip to content" link. */
  skipLink: boolean;
}

export interface KeyboardResult {
  items: ProbeItem[];
  /** Times the focus jumped back more than a row (an observation for the reviewers at ≥ 3). */
  orderJumps: number;
}

/** The same element this many Tabs in a row: focus is stuck. */
const STUCK_AFTER = 3;
/** A jump back up the page of more than this many px is out of reading order. */
const ROW_PX = 40;

export function keyboardProblems(input: KeyboardInput): KeyboardResult {
  const items: ProbeItem[] = [];
  const { stops } = input;
  // Stuck: the same element after 3 Tabs.
  for (let i = STUCK_AFTER - 1; i < stops.length; i++) {
    const run = stops.slice(i - STUCK_AFTER + 1, i + 1);
    const first = run[0];
    if (first && run.every((s) => s.ref === first.ref)) {
      items.push({
        ref: first.ref,
        selector: first.selector,
        measured: `focus stuck on "${first.name || first.selector}" after ${STUCK_AFTER} Tabs`,
        expected: 'Tab moves on to the next control',
      });
      break;
    }
  }
  // Never reached by Tab (only when the sweep wasn't stuck: a stuck sweep reaches nothing). A
  // sweep that stopped nowhere says nothing about reachability: the page wasn't in its normal
  // state (bench:chat, Nov 2: a forced failure had blanked /contacts, and every control read as
  // unreachable).
  if (items.length === 0 && stops.length > 0) {
    // By ref or by selector: refs can be re-issued between the snapshot and the sweep, and a
    // reachable field read as unreachable (bench:chat, Nov 2: demo/chat's contacts filter).
    const reached = new Set(stops.map((s) => s.ref));
    const reachedAt = new Set(stops.map((s) => s.selector).filter(Boolean));
    for (const el of input.interactive) {
      if (reached.has(el.ref) || (el.selector && reachedAt.has(el.selector))) continue;
      items.push({
        ref: el.ref,
        selector: el.selector,
        measured: `"${el.name || el.selector}" can't be reached with Tab`,
        expected: 'every control reachable from the keyboard',
      });
      if (items.length >= 10) break;
    }
  }
  // Hidden while focused: under a sticky header or offscreen for half its box or more.
  const hidden = new Set<string>();
  for (const s of stops) {
    if (s.visible >= 0.5 || hidden.has(s.ref)) continue;
    hidden.add(s.ref);
    items.push({
      ref: s.ref,
      selector: s.selector,
      measured: `"${s.name || s.selector}" is hidden while focused (${Math.round(s.visible * 100)}% visible)`,
      expected: 'the focused control in view',
    });
  }
  // Reading order: a jump back up the page by more than a row.
  let orderJumps = 0;
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const cur = stops[i];
    if (!prev || !cur || prev.ref === cur.ref) continue;
    if (cur.rect.y + cur.rect.height / 2 < prev.rect.y - ROW_PX) orderJumps += 1;
  }
  // A long nav and no way past it.
  if (input.navLinks >= 6 && !input.skipLink)
    items.push({
      ref: '',
      selector: 'body',
      measured: `${input.navLinks} navigation links before the content, no skip link`,
      expected: 'a "Skip to content" link first',
    });
  return { items, orderJumps };
}

/** The keyboard problems' kinds, by what was measured (titles and severities key on these). */
export function keyboardKind(
  measured: string,
): 'stuck' | 'unreachable' | 'hidden' | 'skip-link' | 'dialog' {
  if (measured.startsWith('focus stuck')) return 'stuck';
  if (measured.includes("can't be reached with Tab")) return 'unreachable';
  if (measured.includes('hidden while focused')) return 'hidden';
  if (measured.includes('no skip link')) return 'skip-link';
  return 'dialog';
}

/**
 * Dialogs (§6B.2): when one opens, focus must move inside, Tab must stay inside, Esc must close
 * it and focus must come back to what opened it. The site window measures the four facts.
 */
export function dialogProblems(d: {
  ref: string;
  selector: string;
  name: string;
  focusMovedIn: boolean;
  tabStaysIn: boolean;
  escCloses: boolean;
  focusReturned: boolean;
}): ProbeItem[] {
  const label = d.name ? `the "${d.name}" dialog` : 'a dialog';
  const out: ProbeItem[] = [];
  const add = (measured: string, expected: string) =>
    out.push({ ref: d.ref, selector: d.selector, measured, expected });
  if (!d.focusMovedIn)
    add(`focus stayed behind ${label} when it opened`, 'focus moves into the dialog');
  if (!d.tabStaysIn) add(`Tab leaves ${label} while it's open`, 'Tab stays inside the dialog');
  if (!d.escCloses) add(`Esc doesn't close ${label}`, 'Esc closes the dialog');
  if (!d.focusReturned)
    add(`focus didn't return after ${label} closed`, 'focus back on the control that opened it');
  return out;
}
