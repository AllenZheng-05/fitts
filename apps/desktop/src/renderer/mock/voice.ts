// What the mock "hears" when hold-to-talk is released (SPEC §6.3, §7.5): one canned
// transcript per moment in the scenario. There is no real speech-to-text in Phase 1.
import type { RunState } from '@fitts/schema';

export function cannedTranscript(run: RunState | undefined): string {
  if (!run || run.phase === 'interview') {
    const brief = run?.brief ?? {};
    if (!brief.for) return 'A messaging app so my grandparents can text the family.';
    if (!brief.pain)
      return 'They never know if a message sent, and the buttons all say different things.';
    if (!brief.feel) return 'Calm and simple';
    return 'That covers it.';
  }
  if (run.phase === 'audit') return 'Fitts, check the search page next.';
  return 'Can you try the rolled-back ones again?';
}
