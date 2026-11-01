// "Allow microphone" for real (SPEC-phase4 §10): main's answer, then the renderer's probe.
import { describe, expect, it, vi } from 'vitest';
import { canOpenMicSettings, probeMic, requestMicAccess } from '../../src/renderer/lib/mic';

const stream = () => {
  const stop = vi.fn();
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
};

describe('probeMic', () => {
  it('opens the microphone for a moment and stops every track', async () => {
    const { stream: s, stop } = stream();
    const media = { getUserMedia: vi.fn(() => Promise.resolve(s)) };
    expect(await probeMic(media, 0)).toEqual({ ok: true });
    expect(media.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('tells a denial from a missing device from anything else', async () => {
    const refuse = (name: string) => ({
      getUserMedia: () => Promise.reject(Object.assign(new Error(name), { name })),
    });
    expect(await probeMic(refuse('NotAllowedError'), 0)).toEqual({ ok: false, reason: 'denied' });
    expect(await probeMic(refuse('NotFoundError'), 0)).toEqual({ ok: false, reason: 'no-device' });
    expect(await probeMic(refuse('AbortError'), 0)).toEqual({ ok: false, reason: 'error' });
    expect(await probeMic(undefined, 0)).toEqual({ ok: false, reason: 'error' });
  });
});

describe('requestMicAccess', () => {
  it('stops at main’s refusal without probing', async () => {
    const probe = vi.fn(() => Promise.resolve({ ok: true }));
    const r = await requestMicAccess(
      { requestMic: () => Promise.resolve({ ok: false, reason: 'denied' as const }) },
      probe,
    );
    expect(r).toEqual({ ok: false, reason: 'denied' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('probes when main says the OS didn’t refuse, and without a bridge', async () => {
    const probe = vi.fn(() => Promise.resolve({ ok: true }));
    await requestMicAccess({ requestMic: () => Promise.resolve({ ok: true, probe: true }) }, probe);
    await requestMicAccess({}, probe);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('takes main’s yes as final when it says no probe is needed', async () => {
    const probe = vi.fn(() => Promise.resolve({ ok: false, reason: 'error' as const }));
    expect(
      await requestMicAccess({ requestMic: () => Promise.resolve({ ok: true }) }, probe),
    ).toEqual({ ok: true });
    expect(probe).not.toHaveBeenCalled();
  });
});

describe('canOpenMicSettings', () => {
  it('knows where macOS and Windows keep the setting; Linux has no one page', () => {
    expect(canOpenMicSettings('darwin')).toBe(true);
    expect(canOpenMicSettings('win32')).toBe(true);
    expect(canOpenMicSettings('linux')).toBe(false);
  });
});
