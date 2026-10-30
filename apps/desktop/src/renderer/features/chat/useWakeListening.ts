import type { RunState } from '@fitts/schema';
import { useEffect } from 'react';
import { parseVoiceCommand } from '../../lib/voice-command';
import { listen, type Listening } from '../../lib/voice/session';
import { getEngine } from '../../state/engine';
import { sendFromComposer } from '../../state/actions';
import { useSettings } from '../../state/settings';

/** A rolling session restarts before Transcribe's 60-minute cap (V5). */
const RESTART_MS = 55 * 60_000;

/**
 * "Always listening for 'Fitts'" (SPEC-phase2 §14): one endpointing session while the mode is
 * on. Only utterances that start with "Fitts" count: "Fitts, stop" stops the current action;
 * any other "Fitts, …" is a spoken interrupt. Bare "stop" or "wait" do nothing.
 */
export function useWakeListening(run: RunState | undefined) {
  const talkMode = useSettings((s) => s.talkMode);
  const projectId = run?.projectId;
  useEffect(() => {
    if (talkMode !== 'wake' || !projectId) return;
    let session: Listening | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = async () => {
      session = await listen('ENDPOINTING', projectId, {
        final: (text) => {
          const cmd = parseVoiceCommand(text);
          if (!cmd) return;
          if (cmd.kind === 'stop') getEngine().stopAction(projectId);
          else sendFromComposer(projectId, cmd.text, { spoken: true });
        },
      });
      if (stopped) session?.cancel();
      else if (session)
        timer = setTimeout(() => {
          session?.cancel();
          void start();
        }, RESTART_MS);
    };
    void start();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      session?.cancel();
    };
  }, [talkMode, projectId]);
}
