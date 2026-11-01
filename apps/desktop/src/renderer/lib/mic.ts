// "Allow microphone" for real (SPEC-phase4 §10): main asks the OS (macOS prompts, Windows reads
// the setting), then the renderer opens the microphone for a moment and lets it go, which is
// the one check that proves a device can be used. Nothing is recorded.
import type { MicAccess } from '@fitts/schema';
import { bridge } from './bridge';

/** How long the probe holds the microphone open. */
export const MIC_PROBE_MS = 1000;

type Media = { getUserMedia(c: MediaStreamConstraints): Promise<MediaStream> } | undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A short getUserMedia: the tracks stop as soon as it's done. */
export async function probeMic(
  media: Media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices,
  holdMs = MIC_PROBE_MS,
): Promise<MicAccess> {
  if (!media?.getUserMedia) return { ok: false, reason: 'error' };
  let stream: MediaStream;
  try {
    stream = await media.getUserMedia({ audio: true });
  } catch (e) {
    const name = (e as { name?: string }).name ?? '';
    return {
      ok: false,
      reason:
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'denied'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'no-device'
            : 'error',
    };
  }
  await sleep(holdMs);
  for (const track of stream.getTracks()) track.stop();
  return { ok: true };
}

/**
 * The whole request: main first (the OS prompt or setting), then the probe when main says
 * to. Outside Electron (component tests) there's no bridge and no device: the probe's answer
 * stands on its own.
 */
export async function requestMicAccess(
  b: Pick<ReturnType<typeof bridge>, 'requestMic'> = bridge(),
  probe: () => Promise<MicAccess> = () => probeMic(),
): Promise<MicAccess> {
  const fromMain = b.requestMic ? await b.requestMic() : { ok: true, probe: true };
  if (!fromMain.ok) return fromMain;
  if (!fromMain.probe) return { ok: true };
  return probe();
}

/** Whether this platform has a microphone privacy page Fitts can open. */
export function canOpenMicSettings(platform = bridge().platform): boolean {
  return platform === 'darwin' || platform === 'win32';
}
