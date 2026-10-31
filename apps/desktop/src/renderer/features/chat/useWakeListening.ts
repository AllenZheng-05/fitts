import type { RunState } from '@fitts/schema';
import { useEffect } from 'react';
import { parseVoiceCommand } from '../../lib/voice-command';
import { listen, type Listening } from '../../lib/voice/session';
import { getEngine } from '../../state/engine';
import { sendFromComposer } from '../../state/actions';
import { useSettings } from '../../state/settings';
import { useUi } from '../../state/ui';

/** A rolling session restarts before Transcribe's 60-minute cap (V5). */
const RESTART_MS = 55 * 60_000;
/** After a dropped or refused session, try again after these waits (the last repeats). */
const RETRY_MS = [2_000, 5_000, 15_000, 30_000];
/** "Fitts" on its own: how long Fitts waits for what comes next. */
const ARMED_MS = 10_000;

/**
 * "Always listening for 'Fitts'" (SPEC-phase2 §14): one endpointing session while the mode is
 * on, reopened whenever it drops. Only utterances that start with "Fitts" count: "Fitts, stop"
 * stops the current action, any other "Fitts, …" is a spoken interrupt, and "Fitts" on its own
 * wakes Fitts so the next thing said is for it. Bare "stop" or "wait" do nothing. The mic
 * button pauses it (one session at a time); it picks up again after.
 */
export function useWakeListening(run: RunState | undefined) {
  const talkMode = useSettings((s) => s.talkMode);
  const pushing = useUi((s) => s.micListening || s.micFinishing);
  const projectId = run?.projectId;
  useEffect(() => {
    const ui = () => useUi.getState();
    if (talkMode !== 'wake' || !projectId || pushing) {
      ui().set({ wake: { status: 'off' }, wakeArmed: false });
      return;
    }
    let session: Listening | null = null;
    let stopped = false;
    let failures = 0;
    let rolling: ReturnType<typeof setTimeout> | undefined;
    let retrying: ReturnType<typeof setTimeout> | undefined;
    let armed: ReturnType<typeof setTimeout> | undefined;

    const disarm = () => {
      clearTimeout(armed);
      if (ui().wakeArmed) ui().set({ wakeArmed: false, micPartial: '' });
    };
    const arm = () => {
      ui().set({ wakeArmed: true, micPartial: '' });
      clearTimeout(armed);
      armed = setTimeout(disarm, ARMED_MS);
    };
    const retry = (reason?: string) => {
      session = null;
      clearTimeout(rolling);
      disarm();
      if (stopped) return;
      ui().set({ wake: { status: 'trouble', ...(reason ? { reason } : {}) } });
      const wait = RETRY_MS[Math.min(failures, RETRY_MS.length - 1)] ?? 30_000;
      failures += 1;
      retrying = setTimeout(() => void start(), wait);
    };
    const start = async () => {
      if (stopped) return;
      ui().set({ wake: { status: 'starting' } });
      let reason = '';
      const s = await listen('ENDPOINTING', projectId, {
        partial: (text) => {
          if (!ui().wakeArmed) return;
          ui().set({ micPartial: text });
          clearTimeout(armed);
          armed = setTimeout(disarm, ARMED_MS);
        },
        final: (text) => {
          const cmd = parseVoiceCommand(text, { armed: ui().wakeArmed });
          if (!cmd) return;
          if (cmd.kind === 'wake') return arm();
          disarm();
          if (cmd.kind === 'stop') getEngine().stopAction(projectId);
          else sendFromComposer(projectId, cmd.text, { spoken: true });
        },
        ended: () => {
          if (session && !stopped) retry();
        },
        failed: (why) => {
          reason = why;
        },
      });
      if (stopped) {
        s?.cancel();
        return;
      }
      if (!s) return retry(reason);
      session = s;
      failures = 0;
      ui().set({ wake: { status: 'listening' } });
      rolling = setTimeout(() => {
        const old = session;
        session = null;
        old?.cancel();
        void start();
      }, RESTART_MS);
    };
    void start();
    return () => {
      stopped = true;
      clearTimeout(rolling);
      clearTimeout(retrying);
      clearTimeout(armed);
      const s = session;
      session = null;
      s?.cancel();
      ui().set({ wake: { status: 'off' }, wakeArmed: false, micPartial: '' });
    };
  }, [talkMode, projectId, pushing]);
}
