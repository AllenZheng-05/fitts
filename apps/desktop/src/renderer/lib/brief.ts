import type { Brief } from '@fitts/schema';

const clean = (s: string) => s.trim().replace(/[.\s]+$/, '');

/**
 * The brief as the one paragraph the user reads and edits: the interview's summary, or, for a
 * brief from before there was one, its fields as plain sentences.
 */
export function briefText(b: Brief): string {
  if (b.summary?.trim()) return b.summary.trim();
  const lines: [keyof Brief, (v: string) => string][] = [
    ['for', (v) => `It's for ${v}.`],
    ['who', (v) => `Used by ${v}.`],
    ['pain', (v) => `Where people get stuck: ${v}.`],
    ['feel', (v) => `It should feel ${v}.`],
    ['flows', (v) => `What matters most: ${v}.`],
    ['look', (v) => `The new look: ${v}.`],
    ['keep', (v) => `Keep ${v}.`],
    ['avoid', (v) => `Avoid ${v}.`],
    ['inspiration', (v) => `Sites I admire: ${v}.`],
    ['boldness', (v) => `How far to go: ${v}.`],
    ['outOfScope', (v) => `Don't test ${v}.`],
  ];
  return lines
    .map(([k, line]) => {
      const v = b[k];
      return v?.trim()
        ? line(clean(k === 'for' || k === 'who' ? v.replace(/^./, (c) => c.toLowerCase()) : v))
        : '';
    })
    .filter(Boolean)
    .join(' ');
}
