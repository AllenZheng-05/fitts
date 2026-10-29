import type { ChatItem, RunState } from '@fitts/schema';
import { useEffect } from 'react';
import { copy } from '../copy';
import { bridge } from '../lib/bridge';
import { format } from '../lib/format';
import { useRunStore } from '../state/run-store';
import { useSettings } from '../state/settings';
import { useUi } from '../state/ui';

type Question = Extract<ChatItem, { type: 'question' }>;

/** What a held run is waiting for, as a notification: a blocking question or the gate. */
function needsYou(run: RunState): { id: string; text: string } | null {
  if (run.waitingFor?.startsWith('question:')) {
    const itemId = run.waitingFor.slice('question:'.length);
    const item = run.chat.find((c): c is Question => c.id === itemId && c.type === 'question');
    if (item) return { id: `${run.projectId}:${item.id}`, text: item.text };
  }
  if (run.gate) return { id: `${run.projectId}:${run.gate.id}`, text: copy.gate.title };
  return null;
}

/**
 * A run in a project that isn't on screen still reaches you (SPEC §6.9, §7.7): a real
 * OS notification, once per question. Clicking it opens that project with the question.
 */
export function useBackgroundNotifications() {
  useEffect(() => {
    const sent = new Set<string>();
    const check = () => {
      const { runs, activeProjectId } = useRunStore.getState();
      const screen = useUi.getState().screen;
      if (!useSettings.getState().notificationsAllowed) return;
      for (const run of Object.values(runs)) {
        if (run.projectId === activeProjectId && screen === 'workspace') continue;
        const need = needsYou(run);
        if (!need || sent.has(need.id)) continue;
        sent.add(need.id);
        bridge().notify({
          id: need.id,
          title: copy.notify.title,
          body: format(copy.notify.body, { question: need.text }),
        });
      }
    };
    check();
    const unsubscribe = useRunStore.subscribe(check);
    const offClick = bridge().onNotificationClick((id) => {
      const projectId = id.split(':')[0];
      if (projectId) useUi.getState().openProject(projectId);
    });
    return () => {
      unsubscribe();
      offClick();
    };
  }, []);
}
