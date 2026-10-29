/** Controls keep their clicks; a shape behind one can't be grabbed through it. */
const INTERACTIVE =
  'button, a[href], input, textarea, select, label, summary, [contenteditable=""], [contenteditable="true"], [role="button"], [role="link"], [role="switch"], [role="slider"], [role="tab"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="option"], [role="textbox"]';

/** True when an element paints its own surface (a card, panel, field), hiding what's behind. */
function paints(el: Element): boolean {
  const s = getComputedStyle(el);
  if (s.backgroundImage && s.backgroundImage !== 'none') return true;
  const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor);
  if (!m?.[1]) return false;
  const alpha = m[1].split(/[,/\s]+/).filter(Boolean)[3];
  return alpha === undefined ? true : Number(alpha) > 0;
}

/**
 * A press here lands on the paper the shapes float over: either the empty backdrop or
 * see-through UI (text, transparent layout boxes). Controls and anything with its own
 * background, or inside something with one, don't count.
 */
export function isSeeThrough(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(INTERACTIVE)) return false;
  for (
    let el: Element | null = target;
    el && el !== document.body && el !== document.documentElement;
    el = el.parentElement
  ) {
    if (paints(el)) return false;
  }
  return true;
}
