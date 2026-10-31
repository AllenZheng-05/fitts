import type { ChatItem, RunState } from '@fitts/schema';
import { useEffect } from 'react';
import { copy } from '../../copy';
import { format } from '../../lib/format';
import { say, stopSpeaking, type SpokenLine } from '../../lib/speech';
import { useRunStore } from '../../state/run-store';
import { useSettings } from '../../state/settings';
import { useUi } from '../../state/ui';

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
 * and the destructive gate when it opens (§7.8). New lines cut off old ones. Turning speech
 * off, or switching projects, stops it at once.
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
        stopSpeaking();
        remember();
        return;
      }
      // Everything new in this update is said in order, and cuts off what Fitts was still
      // saying about an earlier moment (it no longer matches the screen).
      const lines: SpokenLine[] = [];
      for (const item of run.chat) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        const text = spokenLine(item, run);
        if (text) lines.push({ text, itemId: item.id });
      }
      if (run.gate && !gates.has(run.gate.id)) {
        gates.add(run.gate.id);
        lines.push({
          text: `${copy.gate.title}. ${format(copy.gate.body, { action: run.gate.action, route: run.gate.route })}`,
        });
      }
      // Not while you're talking to it: the lines are in the chat, and Fitts doesn't talk over you.
      const ui = useUi.getState();
      const userTalking = ui.micListening || ui.wakeArmed || ui.wakeHearing;
      if (useSettings.getState().speaksAloud && !userTalking) say(lines);
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
