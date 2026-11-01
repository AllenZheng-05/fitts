// @vitest-environment node
// Main's half of "Allow microphone" (SPEC-phase4 §10): the OS prompt on macOS, the setting on
// Windows, and the settings page each platform opens after a denial.
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: {},
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  Notification: { isSupported: () => false },
  shell: { openExternal: vi.fn() },
  systemPreferences: {},
}));

import { MIC_SETTINGS, requestMicAccess } from '../../src/main/bridge';

describe('requestMicAccess (main)', () => {
  it('macOS: asks the OS, and a refusal is final', async () => {
    const ask = vi.fn(() => Promise.resolve(false));
    const prefs = { askForMediaAccess: ask, getMediaAccessStatus: () => 'granted' as const };
    expect(await requestMicAccess('darwin', prefs)).toEqual({ ok: false, reason: 'denied' });
    expect(ask).toHaveBeenCalledWith('microphone');
    prefs.askForMediaAccess = vi.fn(() => Promise.resolve(true));
    expect(await requestMicAccess('darwin', prefs)).toEqual({ ok: true, probe: true });
  });

  it('Windows: reads the system setting; anything but "denied" leaves it to the probe', async () => {
    const prefs = {
      askForMediaAccess: vi.fn(() => Promise.resolve(true)),
      getMediaAccessStatus: () => 'denied' as const,
    };
    expect(await requestMicAccess('win32', prefs)).toEqual({ ok: false, reason: 'denied' });
    expect(prefs.askForMediaAccess).not.toHaveBeenCalled();
    prefs.getMediaAccessStatus = () => 'not-determined' as never;
    expect(await requestMicAccess('win32', prefs)).toEqual({ ok: true, probe: true });
  });

  it('Linux: nothing to ask main; the renderer probes', async () => {
    const prefs = {
      askForMediaAccess: vi.fn(() => Promise.resolve(false)),
      getMediaAccessStatus: () => 'denied' as const,
    };
    expect(await requestMicAccess('linux', prefs)).toEqual({ ok: true, probe: true });
  });

  it('knows each platform’s microphone settings page', () => {
    expect(MIC_SETTINGS.darwin).toContain('Privacy_Microphone');
    expect(MIC_SETTINGS.win32).toBe('ms-settings:privacy-microphone');
    expect(MIC_SETTINGS.linux).toBeUndefined();
  });
});
