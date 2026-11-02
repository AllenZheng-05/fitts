// SPEC-phase4 §6A.3: the detail setting's filters (rendering only; the log is always kept).
import type { Observation } from '@fitts/schema';
import { describe, expect, it } from 'vitest';
import { showsNote, showsRecord, showsStep, showsTiming } from '../../src/renderer/lib/detail';

const quick = { label: 'Tapped “Grandma”', costUsd: 0, ms: 120 };
const slow = { label: 'Tapped “NEXT”', costUsd: 0, ms: 1800, slow: true, noticed: ['obs-1'] };
const noted = { label: 'Opened /help', costUsd: 0, noticed: ['obs-2'] };
const note = (severityHint: Observation['severityHint']): Observation => ({
  id: 'obs-1',
  step: 1,
  route: '/',
  kind: 'slow',
  text: 'x',
  severityHint,
});

describe('detail levels', () => {
  it('Everything and Every detail show every step, timing and note', () => {
    for (const level of ['everything', 'all'] as const) {
      expect(showsStep(level, quick)).toBe(true);
      expect(showsTiming(level, quick)).toBe(true);
      expect(showsNote(level, note(1))).toBe(true);
    }
  });

  it('Highlights keeps slow steps and steps with notes, timing only when slow, notes at 3+', () => {
    expect(showsStep('highlights', quick)).toBe(false);
    expect(showsStep('highlights', slow)).toBe(true);
    expect(showsStep('highlights', noted)).toBe(true);
    expect(showsTiming('highlights', quick)).toBe(false);
    expect(showsTiming('highlights', slow)).toBe(true);
    expect(showsNote('highlights', note(2))).toBe(false);
    expect(showsNote('highlights', note(3))).toBe(true);
  });

  it('decisions, passes and per-action requests show only at Every detail', () => {
    const thinking = { label: 'more pages first', costUsd: 0, detail: 'thinking' as const };
    const pass = { label: 'Started exploring', costUsd: 0, detail: 'pass' as const };
    for (const line of [thinking, pass]) {
      expect(showsStep('all', line)).toBe(true);
      expect(showsStep('everything', line)).toBe(false);
      expect(showsStep('highlights', line)).toBe(false);
    }
    expect(showsRecord('all')).toBe(true);
    expect(showsRecord('everything')).toBe(false);
  });

  it('a step with no measured time has no chip at any level', () => {
    expect(showsTiming('all', noted)).toBe(false);
  });
});
