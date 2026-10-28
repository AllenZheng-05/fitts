import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/app/App';
import { copy } from '../../src/renderer/copy';

describe('App scaffold', () => {
  it('renders the Fitts heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: copy.app.name })).toBeInTheDocument();
  });
});

describe('copy', () => {
  it('contains no emoji or exclamation marks', () => {
    const strings = Object.values(copy).flatMap((group) => Object.values(group));
    for (const text of strings) {
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(text).not.toContain('!');
    }
  });
});
