import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/app/App';
import { copy } from '../../src/renderer/copy';

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings);
  return [];
}

describe('App', () => {
  it('opens Welcome on first launch', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: copy.welcome.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.welcome.open })).toBeDisabled();
  });
});

describe('copy', () => {
  it('follows the voice rules: no emoji, no exclamation marks except a greeting (SPEC §8)', () => {
    const strings = allStrings(copy);
    expect(strings.length).toBeGreaterThan(10);
    for (const text of strings) {
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(text.replace(/^Hi \{name\}!/, '')).not.toContain('!');
    }
  });

  it('keeps the canonical strings exactly (SPEC §8)', () => {
    expect(copy.fitts.interviewOpener).toBe(
      "Hi {name}! Before I touch anything, I'd love to hear about this site. What's it for?",
    );
    expect(copy.fitts.readyBar).toBe('I know enough to start');
    expect(copy.fitts.nonBlockingLabel).toBe(
      "When you get a sec · I'm testing other pages meanwhile",
    );
    expect(copy.fitts.stopped).toBe('Stopped. What should I do instead?');
    expect(copy.fitts.handBack).toBe(
      'Thanks. You went through {path}. Want me to test that path properly?',
    );
  });
});
