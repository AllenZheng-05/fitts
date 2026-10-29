import type { ChatItem, RunState } from '@fitts/schema';
import { useEffect } from 'react';
import { copy } from '../../copy';
import { format } from '../../lib/format';
import { speak, stopSpeaking } from '../../lib/speech';
import { useRunStore } from '../../state/run-store';
import { useSettings } from '../../state/settings';

/**
 * The line Fitts says for a chat item: the text for messages and questions, and the first
 * line of any card (SPEC §6.6, §8). User items and step lists are not spoken.
 */
export function spokenLine(item: ChatItem, run: RunState): string | null {
  switch (item.type) {
    case 'fitts.message':
    case 'lookfeel':
      return item.text;
    case 'question':
      return item.text;
    case 'finding':
      return run.findings.find((f) => f.id === item.findingId)?.title ?? null;
    case 'approval.batch':
      return format(copy.items.approvalTitle, { n: item.findingIds.length });
    case 'fix.result': {
      const change = run.changes.find((c) => c.id === item.changeId);
      return change ? format(copy.items.fixed, { title: change.title }) : null;
    }
    case 'state':
      return copy.states[item.stateKind].title.replace('{cap}', `$${run.cost.capUsd}`);
    case 'driving':
      return copy.items.drivingTitle;
    case 'wording':
      return copy.items.wordingTag;
    default:
      return null;
  }
}

/**
 * Speaks new Fitts lines in the active project when "Fitts speaks out loud" is on (§7.5),
 * and the destructive gate when it opens (§7.8). Turning speech off stops it at once.
 */
export function useFittsVoice() {
  useEffect(() => {
    const seen = new Set<string>();
    const gates = new Set<string>();
    const remember = () => {
      const { runs, activeProjectId } = useRunStore.getState();
      const run = runs[activeProjectId];
      for (const item of run?.chat ?? []) seen.add(item.id);
      if (run?.gate) gates.add(run.gate.id);
    };
    remember();

    const unsubscribeRuns = useRunStore.subscribe((state, previous) => {
      const run = state.runs[state.activeProjectId];
      if (!run) return;
      // Switching projects shouldn't read out the other project's history.
      if (state.activeProjectId !== previous.activeProjectId) {
        remember();
        return;
      }
      const loud = useSettings.getState().speaksAloud;
      for (const item of run.chat) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        const line = spokenLine(item, run);
        if (loud && line) speak(line);
      }
      if (run.gate && !gates.has(run.gate.id)) {
        gates.add(run.gate.id);
        if (loud)
          speak(
            `${copy.gate.title}. ${format(copy.gate.body, { action: run.gate.action, route: run.gate.route })}`,
          );
      }
    });
    const unsubscribeSettings = useSettings.subscribe((s, prev) => {
      if (prev.speaksAloud && !s.speaksAloud) stopSpeaking();
    });
    return () => {
      unsubscribeRuns();
      unsubscribeSettings();
      stopSpeaking();
    };
  }, []);
}
