// What the crawler types (§15): real queries in search and lookup fields (a marked query finds
// nothing), the fitts-test marker on anything a site might save.
import { describe, expect, it } from 'vitest';
import { isQueryField, queryFrom, testText, typedText } from '../../src/agent/crawler/brain';

const page = {
  headings: ['Find your team', 'Pikachu and friends'],
  nodes: [{ ref: 'a', role: 'link', name: 'Home' }],
};

describe('typing test data', () => {
  it('search, filter and picker fields are lookups; text areas, email and passwords never are', () => {
    expect(isQueryField({ name: 'Search', role: 'textbox', type: 'text' })).toBe(true);
    expect(isQueryField({ name: '', role: 'searchbox' })).toBe(true);
    expect(isQueryField({ name: 'Pokémon', role: 'combobox', type: 'text' })).toBe(true);
    expect(isQueryField({ name: 'Filter players', role: 'textbox' })).toBe(true);
    expect(isQueryField({ name: 'Message', role: 'textbox', type: 'textarea' })).toBe(false);
    expect(isQueryField({ name: 'Search notes', role: 'textbox', type: 'textarea' })).toBe(false);
    expect(isQueryField({ name: 'Email', role: 'textbox', type: 'email' })).toBe(false);
  });

  it('the explorer types a real word from the page into lookups, marked text elsewhere', () => {
    expect(queryFrom(page)).toBe('team');
    expect(queryFrom({ headings: [], nodes: [] })).toBe('help');
    expect(testText({ name: 'Search', role: 'searchbox' }, page)).toBe('team');
    expect(testText({ name: 'Message', role: 'textbox', type: 'textarea' }, page)).toBe(
      'fitts-test message',
    );
    expect(testText({ name: 'Phone', role: 'textbox', type: 'tel' }, page)).toBe('555-0199');
    expect(testText({ name: 'Email', role: 'textbox', type: 'email' }, page)).toBe(
      'fitts-test@example.com',
    );
  });

  it('the model’s text: lookups lose any marker; anything saved gains one', () => {
    const search = { name: 'Search', role: 'searchbox' };
    const note = { name: 'Note', role: 'textbox', type: 'text' };
    const body = { name: 'Message', role: 'textbox', type: 'textarea' };
    expect(typedText(search, 'Pikachu', 'search')).toBe('Pikachu');
    expect(typedText(search, 'fitts-test Pikachu', 'save')).toBe('Pikachu');
    expect(typedText(note, 'Incineroar', 'search')).toBe('Incineroar');
    expect(typedText(note, 'hello there', 'save')).toBe('fitts-test hello there');
    expect(typedText(body, 'hello', 'search')).toBe('fitts-test hello');
    expect(typedText(body, 'fitts-test hi', 'save')).toBe('fitts-test hi');
  });
});
