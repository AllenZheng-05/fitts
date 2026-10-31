// The renderer's half of voice (SPEC-phase2 §14). Main holds Transcribe and ElevenLabs; this
// captures the mic, shows partials, plays Fitts's voice and reacts to barge-in. When main says
// no (offline, no key), callers fall back to Phase 1's behavior.
import type { TalkSessionMode, VoiceBridge, VoiceEvent } from '@fitts/schema';
import { startMic, type MicCapture } from './mic';
import { PcmPlayer } from './player';

export const voiceBridge = (): VoiceBridge | undefined =>
  (globalThis as { fitts?: { voice?: VoiceBridge } }).fitts?.voice;

/** Every voice event goes through here. */
const listeners = new Set<(e: VoiceEvent) => void>();
let wired = false;
function onVoice(fn: (e: VoiceEvent) => void): () => void {
  const bridge = voiceBridge();
  if (bridge && !wired) {
    wired = true;
    bridge.onEvent((e) => {
      for (const l of [...listeners]) l(e);
    });
    bridge.onAudio((id, pcm) => {
      if (id === playingId) player.push(pcm);
    });
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let bargeIn: (() => void) | undefined;
/** Set by speech.ts: what to do when the user starts talking over Fitts. */
export function onBargeIn(fn: () => void): void {
  bargeIn = fn;
}

/** Cuts Fitts off because the user is talking to it ("Fitts, …" while always listening). */
export function bargeInNow(): void {
  bargeIn?.();
}

export interface Listening {
  /** Stops the mic and waits for the final text (push to talk). */
  finish(): Promise<string>;
  cancel(): void;
}

/** Opens a session and the mic. Null means "use the fallback" (offline, no key, no mic). */
export async function listen(
  mode: TalkSessionMode,
  projectId: string,
  on: {
    partial?: (text: string) => void;
    final?: (text: string) => void;
    ended?: () => void;
    /** Why there's no session ("no key", "offline", no mic). */
    failed?: (reason: string) => void;
    /**
     * Whether any speech cuts Fitts off (the mic button). "Always listening" hears everything
     * in the room, so it cuts Fitts off itself, only when it hears "Fitts".
     */
    bargeIn?: boolean;
  },
): Promise<Listening | null> {
  const bridge = voiceBridge();
  if (!bridge) return null;
  let last = '';
  let finalText: string | null = null;
  let waiting: ((text: string) => void) | undefined;
  // This session's id, once main has opened it: events from any other session are ignored.
  let id = -1;
  let mic: MicCapture | undefined;
  let over = false;
  const off = onVoice((e) => {
    if (!('session' in e) || e.session !== id) return;
    if (e.kind === 'speech') {
      if (on.bargeIn !== false) bargeIn?.();
    } else if (e.kind === 'partial') {
      last = e.text;
      on.partial?.(e.text);
    } else if (e.kind === 'final') {
      finalText = e.text;
      on.final?.(e.text);
      waiting?.(e.text);
    } else if (e.kind === 'closed' || (e.kind === 'error' && !waiting)) {
      // The session is over (the server closed it, or it dropped): stop the mic and listening.
      over = true;
      off();
      mic?.stop();
      waiting?.(finalText ?? last);
      on.ended?.();
    }
  });
  const started: { ok: boolean; reason?: string; session?: number } = await bridge
    .start(mode, projectId)
    .catch((e: unknown) => ({ ok: false, reason: e instanceof Error ? e.message : '' }));
  if (!started.ok || started.session === undefined) {
    off();
    on.failed?.(started.reason ?? '');
    return null;
  }
  const session = started.session;
  id = session;
  try {
    mic = await startMic((pcm) => bridge.audio(session, pcm));
  } catch {
    bridge.cancel(session);
    off();
    on.failed?.('mic');
    return null;
  }
  if (over) {
    // It closed while the mic was starting.
    on.failed?.('closed');
    return null;
  }
  const capture = mic;
  return {
    finish: () =>
      new Promise<string>((resolve) => {
        capture.stop();
        const done = (text: string) => {
          clearTimeout(timer);
          waiting = undefined;
          off();
          resolve(text);
        };
        waiting = done;
        const timer = setTimeout(() => {
          bridge.cancel(session);
          done(finalText ?? last);
        }, 8000);
        bridge.end(session);
      }),
    cancel: () => {
      off();
      capture.stop();
      bridge.cancel(session);
    },
  };
}

// ── Fitts's voice ─────────────────────────────────────────────────────────────

const player = new PcmPlayer();
let playingId = -1;

/**
 * Says one line with ElevenLabs. Resolves true when it played to the end, false when it was
 * cut off, and null when ElevenLabs isn't available or failed (the caller uses the OS voice).
 */
export async function speakLine(
  text: string,
  voiceId: string,
  projectId: string,
  onStart: () => void,
): Promise<boolean | null> {
  const bridge = voiceBridge();
  if (!bridge) return null;
  // true: played to the end; false: cut off; null: ElevenLabs failed (use the OS voice).
  const done = new Promise<boolean | null>((resolve) => {
    const off = onVoice((e) => {
      if ((e.kind === 'spoken' || e.kind === 'speakError') && e.id === playingId) {
        off();
        if (e.kind === 'speakError') {
          player.stop(false);
          resolve(null);
        } else player.finish();
      }
    });
    player.begin(() => {
      off();
      resolve(true);
    });
  });
  const res = await bridge.speak(text, voiceId, projectId).catch(() => ({ ok: false, id: -1 }));
  if (!res.ok) {
    player.stop(false);
    return null;
  }
  playingId = res.id;
  onStart();
  return done;
}

/** Cuts Fitts off (fades within 100ms). */
export function stopVoice(): void {
  playingId = -1;
  player.stop(true);
  voiceBridge()?.stopSpeaking();
}
