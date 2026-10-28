import { afterEach, describe, expect, it } from 'vitest';
import { format, formatUsd } from '../../src/renderer/lib/format';
import { shortcutLabel } from '../../src/renderer/lib/platform';
import { severityLabel, severityTone } from '../../src/renderer/lib/severity';

describe('severity helpers (SPEC §5.1)', () => {
  it('labels each form', () => {
    expect(severityLabel(3, 'short')).toBe('Sev 3');
    expect(severityLabel(3, 'list')).toBe('Severity 3');
    expect(severityLabel(4, 'detail')).toBe('Severity 4 · Catastrophic');
    expect(severityLabel(3, 'detail')).toBe('Severity 3 · Major');
    expect(severityLabel(2, 'detail')).toBe('Severity 2 · Minor');
    expect(severityLabel(1, 'detail')).toBe('Severity 1 · Cosmetic');
    expect(severityLabel(0, 'detail')).toBe('Severity 0 · Not a problem');
  });

  it('maps severities to the badge colors', () => {
    expect(severityTone(4)).toBe('bg-wine text-card');
    expect(severityTone(3)).toBe('bg-coral-tint text-coral-ink');
    expect(severityTone(2)).toBe('bg-sun-tint text-sun-ink');
    expect(severityTone(1)).toBe('bg-neutral-tint text-neutral-ink');
    expect(severityTone(0)).toBe('bg-neutral-tint text-neutral-ink');
  });
});

describe('format', () => {
  it('fills placeholders and keeps unknown ones', () => {
    expect(format('Hi {name}, {x}', { name: 'Allen' })).toBe('Hi Allen, {x}');
  });

  it('formats money', () => {
    expect(formatUsd(1.84)).toBe('$1.84');
    expect(formatUsd(20, { dropWholeCents: true })).toBe('$20');
    expect(formatUsd(20.5, { dropWholeCents: true })).toBe('$20.50');
  });
});

describe('shortcutLabel (SPEC §7.9)', () => {
  const g = globalThis as { fitts?: { platform: string } };
  afterEach(() => {
    delete g.fitts;
  });

  it('uses symbols on macOS', () => {
    g.fitts = { platform: 'darwin' };
    expect(shortcutLabel(['mod', '.'])).toBe('⌘.');
    expect(shortcutLabel(['mod', 'shift', 'P'])).toBe('⌘⇧P');
  });

  it('uses Ctrl elsewhere', () => {
    g.fitts = { platform: 'win32' };
    expect(shortcutLabel(['mod', '.'])).toBe('Ctrl+.');
    expect(shortcutLabel(['alt', 'Space'])).toBe('Alt+Space');
  });
});
