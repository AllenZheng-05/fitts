// The page-side helper the site window evaluates its scripts with (`const F = REFS`): element
// refs, and picking a value for a field that takes a choice. Plain JS in a string, no imports.

/** Assigns `e<n>` to elements without a data-ref/data-testid, stable for the page load. */
export const REFS = `(() => {
  const w = window;
  w.__fitts = w.__fitts || { n: 0 };
  const own = (el) => el.getAttribute('data-ref') || el.getAttribute('data-testid') || el.getAttribute('data-fitts-ref');
  const refOf = (el) => {
    const r = own(el);
    if (r) return r;
    const id = 'e' + (++w.__fitts.n);
    el.setAttribute('data-fitts-ref', id);
    return id;
  };
  const find = (ref) => {
    const q = CSS.escape(ref);
    return document.querySelector('[data-ref="' + q + '"],[data-testid="' + q + '"],[data-fitts-ref="' + q + '"]');
  };
  // React and the like listen for the native setter's input and change events.
  const setValue = (el, v) => {
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  const FORMATS = { date: /^\\d{4}-\\d{2}-\\d{2}$/, time: /^\\d{2}:\\d{2}$/, month: /^\\d{4}-\\d{2}$/, 'datetime-local': /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/ };
  // A field that takes a choice, not keystrokes (a select; a date, time or month input), gets
  // one the way a person's picker would: the option or value the text names, else a sensible
  // one. False for every other field (it's typed).
  const pick = (el, text) => {
    const t = String(text).trim();
    if (el.tagName === 'SELECT') {
      const opts = [...el.options].filter((o) => !o.disabled && o.value !== '');
      if (!opts.length) return true;
      const low = t.toLowerCase();
      const hit = low && opts.find((o) => o.value.toLowerCase() === low || o.text.trim().toLowerCase().startsWith(low));
      if (hit) return setValue(el, hit.value);
      if (!el.value) return setValue(el, opts[0].value);
      // Already set: the next choice, so trying the control changes something.
      const at = opts.findIndex((o) => o.value === el.value);
      return setValue(el, opts[(at + 1) % opts.length].value);
    }
    const kind = el.tagName === 'INPUT' ? el.type : '';
    if (!FORMATS[kind]) return false;
    const inRange = (v) => (!el.min || v >= el.min) && (!el.max || v <= el.max);
    if (FORMATS[kind].test(t) && inRange(t)) return setValue(el, t);
    // A week out, and each later field of the kind a day (or an hour) after the one before it:
    // a return date after its pickup date.
    const nth = Math.max(0, [...document.querySelectorAll('input[type="' + kind + '"]')].indexOf(el));
    const pad = (n) => String(n).padStart(2, '0');
    const day = new Date();
    day.setDate(day.getDate() + 7 + nth);
    const iso = day.getFullYear() + '-' + pad(day.getMonth() + 1) + '-' + pad(day.getDate());
    let v = kind === 'time' ? pad(10 + nth) + ':00' : kind === 'month' ? iso.slice(0, 7) : kind === 'date' ? iso : iso + 'T10:00';
    if (el.min && v < el.min) v = el.min;
    if (el.max && v > el.max) v = el.max;
    return setValue(el, v);
  };
  return { own, refOf, find, pick };
})()`;
