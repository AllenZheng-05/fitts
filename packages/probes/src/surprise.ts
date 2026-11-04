// The surprise detector's analysis (SPEC-phase4 §6B.5). The page script records events with
// their times; main records when input was sent (Fitts's or the owner's). This decides which
// events had no input to explain them. WCAG-defined ones (3.2.1, 3.2.2, 2.2.1, 1.4.2) and a
// target that moved just before the tap are findings; the rest are notes for the reviewers.
import type { ProbeItem } from '@fitts/schema';

/** What the detector records; `path` is the page it happened on (an SPA reads it later). */
export type SurpriseEvent = SurpriseEventBody & { path?: string };

type SurpriseEventBody =
  | {
      type: 'added';
      at: number;
      ref: string;
      selector: string;
      name: string;
      role: string;
      fixed: boolean;
      zIndex: number;
      /** Share of the viewport it covers (0–1). */
      coverage: number;
    }
  | {
      type: 'shift';
      at: number;
      hadRecentInput: boolean;
      sources: { ref: string; selector: string; name: string; fromY: number; toY: number }[];
    }
  | {
      type: 'focus';
      at: number;
      ref: string;
      selector: string;
      name: string;
      caused?: 'nav' | 'dialog';
    }
  /** Typing alone (no submit) changed the page or opened something (WCAG 3.2.2). */
  | { type: 'typed-change'; at: number; ref: string; selector: string; name: string; what: string }
  /** `own`: Fitts scrolled it (a control into view, the top before a Tab sweep) or a key did. */
  | { type: 'scroll'; at: number; dy: number; own?: boolean }
  | {
      type: 'removed';
      at: number;
      ref: string;
      selector: string;
      words: number;
      shownMs: number;
      text: string;
    }
  | { type: 'media'; at: number; ref: string; selector: string; muted: boolean; playingMs: number };

export interface SurpriseNote {
  kind: 'popped-up' | 'jumped' | 'scrolled-by-itself' | 'focus-moved';
  ref: string;
  measured: string;
  at: number;
}

export interface SurpriseResult {
  /** The 'surprise' probe's items (findings). */
  items: ProbeItem[];
  notes: SurpriseNote[];
}

/** An event this long after the last input had nothing to prompt it. */
export const NO_INPUT_MS = 1000;
/** A dialog later than this after a tap is slower than the tap's own answer: the judge decides. */
export const SOON_AFTER_MS = 300;
/** A jump smaller than this isn't worth a line. */
const JUMP_PX = 50;
const SCROLL_PX = 200;
const TOAST_WORDS = 8;
const TOAST_MS = 5000;
const AUTOPLAY_MS = 3000;

const secs = (ms: number) => (Math.round(ms / 100) / 10).toFixed(1);

/** Time since the last input at or before `at` (Infinity when there was none). */
function sinceInput(at: number, inputs: number[]): number {
  let last = -Infinity;
  for (const t of inputs) if (t <= at && t > last) last = t;
  return at - last;
}

export function surpriseProblems(
  events: SurpriseEvent[],
  inputs: number[],
  loadedAt = 0,
): SurpriseResult {
  const items: ProbeItem[] = [];
  const notes: SurpriseNote[] = [];
  const unprompted = (at: number) => sinceInput(at, inputs) > NO_INPUT_MS;
  const after = (at: number) =>
    inputs.some((t) => t <= at)
      ? `${secs(sinceInput(at, inputs))} s after the last tap`
      : `${secs(at - loadedAt)} s after the page loaded`;
  for (const e of events) {
    switch (e.type) {
      case 'added': {
        const overlay =
          e.role === 'dialog' ||
          e.role === 'alertdialog' ||
          (e.fixed && e.zIndex >= 100) ||
          e.coverage >= 0.25;
        const isDialog = e.role === 'dialog' || e.role === 'alertdialog';
        const what = `${isDialog ? 'a dialog' : 'an overlay'}${e.name ? ` ("${e.name}")` : ''}`;
        if (overlay && unprompted(e.at))
          notes.push({
            kind: 'popped-up',
            ref: e.ref,
            at: e.at,
            measured: `${what} popped up ${after(e.at)} without anything prompting it`,
          });
        // A dialog a beat after a tap, slower than the tap's own answer, may still have nothing to
        // do with it (a fast crawl taps often): a note, and the judge, told the last action,
        // decides whether a person would expect it (bench:chat, Nov 2).
        else if (isDialog && sinceInput(e.at, inputs) > SOON_AFTER_MS)
          notes.push({
            kind: 'popped-up',
            ref: e.ref,
            at: e.at,
            measured: `${what} popped up ${after(e.at)}`,
          });
        break;
      }
      case 'shift': {
        if (e.hadRecentInput) break;
        const moved = [...e.sources].sort(
          (a, b) => Math.abs(b.toY - b.fromY) - Math.abs(a.toY - a.fromY),
        )[0];
        if (!moved || Math.abs(moved.toY - moved.fromY) < JUMP_PX) break;
        const dy = moved.toY - moved.fromY;
        notes.push({
          kind: 'jumped',
          ref: moved.ref,
          at: e.at,
          measured: `${moved.name ? `"${moved.name}"` : 'the content'} jumped ${Math.abs(Math.round(dy))} px ${dy > 0 ? 'down' : 'up'} ${after(e.at)}, with no tap`,
        });
        break;
      }
      case 'focus': {
        if (!unprompted(e.at)) break;
        if (e.caused)
          items.push({
            ref: e.ref,
            selector: e.selector,
            measured: `focusing "${e.name || e.selector}" alone ${e.caused === 'nav' ? 'opened another page' : 'opened a dialog'}`,
            expected: 'nothing changes on focus alone (WCAG 3.2.1)',
          });
        else
          notes.push({
            kind: 'focus-moved',
            ref: e.ref,
            at: e.at,
            measured: `focus moved to "${e.name || e.selector}" ${after(e.at)}, with nothing pressed`,
          });
        break;
      }
      case 'typed-change':
        items.push({
          ref: e.ref,
          selector: e.selector,
          measured: `typing in "${e.name || e.selector}" ${e.what} before anything was submitted`,
          expected: 'typing changes nothing else until you submit (WCAG 3.2.2)',
        });
        break;
      case 'scroll':
        if (!e.own && Math.abs(e.dy) > SCROLL_PX && unprompted(e.at))
          notes.push({
            kind: 'scrolled-by-itself',
            ref: '',
            at: e.at,
            measured: `the page scrolled ${Math.abs(Math.round(e.dy))} px ${e.dy > 0 ? 'down' : 'up'} by itself ${after(e.at)}`,
          });
        break;
      case 'removed':
        if (e.words >= TOAST_WORDS && e.shownMs < TOAST_MS)
          items.push({
            ref: e.ref,
            selector: e.selector,
            measured: `a ${e.words}-word message ("${e.text.slice(0, 50)}") vanished after ${secs(e.shownMs)} s`,
            expected: 'time to read it, or a way to keep it (WCAG 2.2.1)',
          });
        break;
      case 'media':
        if (!e.muted && e.playingMs > AUTOPLAY_MS && unprompted(e.at))
          items.push({
            ref: e.ref,
            selector: e.selector,
            measured: `sound played on its own for ${secs(e.playingMs)} s`,
            expected: 'no sound without a tap, or a way to stop it (WCAG 1.4.2)',
          });
        break;
    }
  }
  return { items, notes };
}

/**
 * A target that moved more than 20 px between when Fitts decided to tap it (the snapshot) and
 * the tap itself: a person would have mis-tapped (severity 3).
 */
export function movedBeforeTap(t: {
  ref: string;
  selector: string;
  name: string;
  decided: { x: number; y: number };
  tapped: { x: number; y: number };
}): ProbeItem | null {
  const d = Math.hypot(t.tapped.x - t.decided.x, t.tapped.y - t.decided.y);
  if (d <= 20) return null;
  return {
    ref: t.ref,
    selector: t.selector,
    measured: `"${t.name || t.selector}" moved ${Math.round(d)} px just before the tap`,
    expected: 'controls stay put while the page loads',
  };
}

/** An element's box in the view, and how far the page was scrolled when it was read. */
export interface ViewBox {
  left: number;
  top: number;
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}

/**
 * Where a target's center was when Fitts decided to tap it and when it tapped, on the page
 * rather than in the view: a scroll (Fitts's own into-view, smooth on a site with
 * `scroll-behavior: smooth`) moves everything in the view and nothing on the page (Basil &
 * Ember, Nov 4: "Order pickup moved 121 px"). Undefined when it stayed within 20 px.
 */
export function movedOnPage(
  decided: ViewBox,
  tapped: ViewBox,
): { decided: { x: number; y: number }; tapped: { x: number; y: number } } | undefined {
  const center = (b: ViewBox) => ({
    x: Math.round(b.left + b.width / 2 + b.scrollX),
    y: Math.round(b.top + b.height / 2 + b.scrollY),
  });
  const a = center(decided);
  const b = center(tapped);
  return Math.hypot(b.x - a.x, b.y - a.y) > 20 ? { decided: a, tapped: b } : undefined;
}

/** The surprise probe's kinds, by what was measured (titles and severities key on these). */
export function surpriseKind(
  measured: string,
): 'focus' | 'typing' | 'vanished' | 'autoplay' | 'moved' {
  if (measured.startsWith('focusing ')) return 'focus';
  if (measured.startsWith('typing in ')) return 'typing';
  if (measured.includes(' vanished after ')) return 'vanished';
  if (measured.startsWith('sound played')) return 'autoplay';
  return 'moved';
}
