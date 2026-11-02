// The surprise detector (SPEC-phase4 §6B.5): installed in the site window's isolated world on
// every page load, always on during the audit. It only records what happens and when; the
// analysis (surprise.ts) decides what had no input to explain it, using the input times main
// sends. Bundled on its own (dist/detector.js) so it can run before the probes are injected.
import type { SurpriseEvent } from './surprise';

interface DetectorApi {
  events: SurpriseEvent[];
  /** performance.now() when the detector started (the page load, near enough). */
  startedAt: number;
  /** Drains what's been recorded since the last read (times relative to startedAt). */
  take(): SurpriseEvent[];
}

const w = window as unknown as { __fittsSurprise?: DetectorApi };

if (!w.__fittsSurprise) {
  const startedAt = performance.now();
  const events: SurpriseEvent[] = [];
  const now = () => Math.round(performance.now() - startedAt);
  const MAX = 300;
  const push = (e: SurpriseEvent) => {
    // The page it happened on: in a single-page app the next read can come from another route.
    if (events.length < MAX) events.push({ ...e, path: location.pathname });
  };
  const refOf = (el: Element) =>
    el.getAttribute('data-ref') ??
    el.getAttribute('data-testid') ??
    el.getAttribute('data-fitts-ref') ??
    '';
  const selectorOf = (el: Element) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = el.classList[0] ? `.${el.classList[0]}` : '';
    return `${el.tagName.toLowerCase()}${id || cls}`;
  };
  const nameOf = (el: Element) =>
    (el.getAttribute('aria-label') ?? el.textContent ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
  const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const TOASTY = /toast|snack|notif|flash|alert/i;
  const shownAt = new WeakMap<Element, number>();
  let lastTrusted = -Infinity;
  let pendingFocus: { at: number; el: Element; path: string } | null = null;
  let pendingTyping: { at: number; el: Element; path: string } | null = null;

  const isDialog = (el: Element) =>
    el.matches('[role=dialog],[role=alertdialog],dialog[open],[aria-modal=true]');

  // Added and removed elements: overlays, dialogs, toasts.
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue;
        const s = getComputedStyle(n);
        const rect = n.getBoundingClientRect();
        const coverage =
          (Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)) *
            Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0))) /
          Math.max(1, innerWidth * innerHeight);
        const fixed = s.position === 'fixed' || s.position === 'sticky';
        const dialog =
          isDialog(n) || n.querySelector('[role=dialog],[role=alertdialog],[aria-modal=true]');
        if (dialog || (fixed && (Number(s.zIndex) || 0) >= 100) || coverage >= 0.25)
          push({
            type: 'added',
            at: now(),
            ref: refOf(n),
            selector: selectorOf(n),
            name: nameOf(dialog instanceof Element ? dialog : n),
            role: dialog ? 'dialog' : (n.getAttribute('role') ?? ''),
            fixed,
            zIndex: Number(s.zIndex) || 0,
            coverage: Math.round(coverage * 100) / 100,
          });
        if (n.matches('[role=status],[role=alert],[aria-live]') || TOASTY.test(String(n.className)))
          shownAt.set(n, now());
        if (dialog) {
          if (pendingFocus && now() - pendingFocus.at < 500) {
            push({
              type: 'focus',
              at: pendingFocus.at,
              ref: refOf(pendingFocus.el),
              selector: selectorOf(pendingFocus.el),
              name: nameOf(pendingFocus.el),
              caused: 'dialog',
            });
            pendingFocus = null;
          }
          if (pendingTyping && now() - pendingTyping.at < 800) {
            push({
              type: 'typed-change',
              at: pendingTyping.at,
              ref: refOf(pendingTyping.el),
              selector: selectorOf(pendingTyping.el),
              name: nameOf(pendingTyping.el),
              what: 'opened a dialog',
            });
            pendingTyping = null;
          }
        }
      }
      for (const n of r.removedNodes) {
        if (!(n instanceof Element)) continue;
        const at = shownAt.get(n);
        if (at === undefined) continue;
        const text = (n.textContent ?? '').trim().replace(/\s+/g, ' ');
        push({
          type: 'removed',
          at: now(),
          ref: refOf(n),
          selector: selectorOf(n),
          words: words(text),
          shownMs: now() - at,
          text: text.slice(0, 80),
        });
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Layout shifts, with the elements that moved.
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        hadRecentInput: boolean;
        sources?: {
          node?: Node | null;
          previousRect: DOMRectReadOnly;
          currentRect: DOMRectReadOnly;
        }[];
      })[]) {
        const sources = (entry.sources ?? []).flatMap((s) => {
          const el = s.node instanceof Element ? s.node : s.node?.parentElement;
          return el
            ? [
                {
                  ref: refOf(el),
                  selector: selectorOf(el),
                  name: nameOf(el),
                  fromY: Math.round(s.previousRect.y),
                  toY: Math.round(s.currentRect.y),
                },
              ]
            : [];
        });
        if (sources.length)
          push({ type: 'shift', at: now(), hadRecentInput: entry.hadRecentInput, sources });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    // No layout-shift support: no jump notes.
  }

  // Input, focus, typing and scrolling.
  for (const type of ['pointerdown', 'keydown'])
    document.addEventListener(
      type,
      (e) => {
        if (e.isTrusted) lastTrusted = now();
      },
      true,
    );
  document.addEventListener(
    'focusin',
    (e) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el || now() - lastTrusted < 300) return;
      pendingFocus = { at: now(), el, path: location.pathname };
      setTimeout(() => {
        const f = pendingFocus;
        if (!f || f.el !== el) return;
        pendingFocus = null;
        const nav = location.pathname !== f.path;
        push({
          type: 'focus',
          at: f.at,
          ref: refOf(el),
          selector: selectorOf(el),
          name: nameOf(el),
          ...(nav ? { caused: 'nav' as const } : {}),
        });
      }, 500);
    },
    true,
  );
  document.addEventListener(
    'input',
    (e) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el || !e.isTrusted) return;
      pendingTyping = { at: now(), el, path: location.pathname };
      setTimeout(() => {
        const t = pendingTyping;
        if (!t || t.el !== el) return;
        pendingTyping = null;
        if (location.pathname !== t.path)
          push({
            type: 'typed-change',
            at: t.at,
            ref: refOf(el),
            selector: selectorOf(el),
            name: nameOf(el),
            what: 'opened another page',
          });
      }, 800);
    },
    true,
  );
  // Submitting is what typing is allowed to trigger.
  document.addEventListener('submit', () => (pendingTyping = null), true);
  let lastY = scrollY;
  addEventListener(
    'scroll',
    () => {
      const dy = scrollY - lastY;
      lastY = scrollY;
      if (Math.abs(dy) > 200) push({ type: 'scroll', at: now(), dy: Math.round(dy) });
    },
    { passive: true },
  );

  // Sound that plays on its own: how long it played unmuted.
  const playing = new WeakMap<HTMLMediaElement, number>();
  document.addEventListener(
    'play',
    (e) => {
      if (e.target instanceof HTMLMediaElement) playing.set(e.target, now());
    },
    true,
  );
  setInterval(() => {
    for (const m of document.querySelectorAll('video,audio')) {
      const el = m as HTMLMediaElement;
      const since = playing.get(el);
      if (since === undefined || el.paused) continue;
      const ms = now() - since;
      if (ms > 3000 && !el.muted && el.volume > 0) {
        push({
          type: 'media',
          at: since,
          ref: refOf(el),
          selector: selectorOf(el),
          muted: false,
          playingMs: ms,
        });
        playing.delete(el);
      }
    }
  }, 1000);

  w.__fittsSurprise = {
    events,
    startedAt,
    take() {
      return events.splice(0, events.length);
    },
  };
}
