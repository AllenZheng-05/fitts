// How it works's profiles table is a copy of what apps/desktop's router decides. This compares
// each routed row with modelFor() and reviewerRoster(), with a Baseten key, as the table says.
import { describe, expect, it } from 'vitest';
import { modelFor, reviewerRoster, type Profile } from '../../../desktop/src/agent/llm/router';
import { MODEL_NAMES, PROFILE_ROWS } from '../../src/content/how';

const opts = { contributor: false, baseten: true };
const name = (model: string) => MODEL_NAMES[model] ?? model;

/** "1 Muse Spark Open, 2 Muse Spark, 2 Muse Wonder", in roster order. */
function roster(profile: Profile): string {
  const counts = new Map<string, number>();
  for (const m of reviewerRoster(profile, opts)) {
    const n = name(m.model);
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts].map(([n, c]) => `${c} ${n}`).join(', ');
}

describe('the profiles table', () => {
  it('matches the router for every routed job', () => {
    for (const row of PROFILE_ROWS) {
      if (!row.job) continue;
      for (const profile of ['economy', 'quality', 'open'] as const) {
        const expected =
          row.job === 'reviewers' ? roster(profile) : name(modelFor(row.job, profile, opts).model);
        expect(row[profile], `${row.label} in ${profile}`).toBe(expected);
      }
    }
  });

  it('names every model the router can pick', () => {
    for (const profile of ['economy', 'quality', 'open'] as const)
      for (const m of reviewerRoster(profile, opts)) expect(MODEL_NAMES[m.model]).toBeDefined();
  });
});
