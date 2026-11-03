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

describe('F.options and F.hours', () => {
  type G = F & {
    options(el: Element): string[] | undefined;
    hours(text: string): string[];
  };
  const G = () => helper() as G;

  it("reads a select's and a datalist's choices without opening them", () => {
    document.body.innerHTML = `
      <select id="t"><option>As soon as possible</option><option>2:30 AM</option><option>2:45 AM</option></select>
      <input id="c" list="cities"><datalist id="cities"><option value="Austin"></option><option value="Boston"></option></datalist>
      <input id="n">`;
    expect(G().options(document.getElementById('t')!)).toEqual([
      'As soon as possible',
      '2:30 AM',
      '2:45 AM',
    ]);
    expect(G().options(document.getElementById('c')!)).toEqual(['Austin', 'Boston']);
    expect(G().options(document.getElementById('n')!)).toBeUndefined();
  });

  it('finds the lines that state hours, and nothing else', () => {
    const text = [
      'Hours',
      'Tuesday\t4:00 PM – 10:00 PM',
      'Mon–Fri 09:00-17:30',
      'Saturday 11am to 11pm',
      'Call 555-0100 or order 2 - 3 pizzas',
      'Tuesday\t4:00 PM – 10:00 PM',
    ].join('\n');
    expect(G().hours(text)).toEqual([
      'Tuesday 4:00 PM – 10:00 PM',
      'Mon–Fri 09:00-17:30',
      'Saturday 11am to 11pm',
    ]);
  });
});
