import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/app/App';
import { copy } from '../../src/renderer/copy';

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings);
  return [];
}

describe('App scaffold', () => {
  it('renders the Fitts heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: copy.app.name })).toBeInTheDocument();
  });
});

describe('copy', () => {
  it('follows the voice rules: no emoji, no exclamation marks (SPEC §8)', () => {
    const strings = allStrings(copy);
    expect(strings.length).toBeGreaterThan(10);
    for (const text of strings) {
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(text).not.toContain('!');
    }
  });
});
