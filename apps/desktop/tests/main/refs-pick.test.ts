/// <reference lib="dom" />
// @vitest-environment jsdom
// The site window's F.pick: a select or a date, time or month field takes a choice, not
// keystrokes (the held-out run typed "fitts message" into a date field and a time select, so its
// checkout never got past the dates step). Set through the native setter, with input and change.
import { beforeEach, describe, expect, it } from 'vitest';
import { REFS } from '../../src/main/site/refs';

type F = { pick(el: Element, text: string): boolean };
// REFS is page code in a string; the site window evaluates it in the page, and so does this.
// eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
const helper = () => new Function(`return ${REFS}`)() as F;

const iso = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

describe('F.pick', () => {
  let events: string[];
  beforeEach(() => {
    events = [];
    document.body.innerHTML = `
      <select id="time"><option value="">Choose a time</option><option>9:00 AM</option><option>10:00 AM</option></select>
      <select id="sort"><option value="popular" selected>Most popular</option><option value="price">Lowest price</option></select>
      <input id="pickup" type="date">
      <input id="return" type="date">
      <input id="later" type="date" min="2099-01-01">
      <input id="at" type="time">
      <input id="name" type="text">`;
    for (const el of document.querySelectorAll('select, input'))
      for (const type of ['input', 'change'])
        el.addEventListener(type, () => events.push(`${el.id}:${type}`));
  });
  const $ = <T extends Element>(id: string) => document.getElementById(id) as unknown as T;

  it('picks the option the text names, else the first real one', () => {
    const F = helper();
    expect(F.pick($('time'), '10:00')).toBe(true);
    expect($<HTMLSelectElement>('time').value).toBe('10:00 AM');
    $<HTMLSelectElement>('time').value = '';
    expect(F.pick($('time'), 'fitts message')).toBe(true);
    expect($<HTMLSelectElement>('time').value).toBe('9:00 AM');
    expect(events).toContain('time:change');
    expect(events).toContain('time:input');
  });

  it('moves a select that already has a value to the next choice', () => {
    expect(helper().pick($('sort'), 'fitts message')).toBe(true);
    expect($<HTMLSelectElement>('sort').value).toBe('price');
  });

  it('gives date fields a valid date a week out, each later one a day after, within min', () => {
    const F = helper();
    F.pick($('pickup'), 'fitts message');
    F.pick($('return'), '');
    F.pick($('later'), '');
    expect($<HTMLInputElement>('pickup').value).toBe(iso(7));
    expect($<HTMLInputElement>('return').value).toBe(iso(8));
    expect($<HTMLInputElement>('later').value).toBe('2099-01-01');
    expect(events).toContain('return:change');
  });

  it('keeps a valid value the text spells out, and sets a time', () => {
    const F = helper();
    F.pick($('pickup'), '2098-05-06');
    F.pick($('at'), 'soon');
    expect($<HTMLInputElement>('pickup').value).toBe('2098-05-06');
    expect($<HTMLInputElement>('at').value).toBe('10:00');
  });

  it('leaves every other field to be typed', () => {
    expect(helper().pick($('name'), 'fitts message')).toBe(false);
    expect($<HTMLInputElement>('name').value).toBe('');
    expect(events).toEqual([]);
  });
});
