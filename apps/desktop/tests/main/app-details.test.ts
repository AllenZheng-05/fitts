// @vitest-environment node
// The Windows taskbar's icon: packaged, from Fitts.exe (the .ico is inside app.asar, which
// Explorer can't read); in dev, from the .ico file, under a dev-only AppUserModelID.
import { describe, expect, it } from 'vitest';
import { APP_ID, appDetails, appIdFor } from '../../src/main/app-details';

const ICO = 'C:/fitts/apps/desktop/resources/icon.ico';

describe('appDetails', () => {
  it('packaged: the icon comes from Fitts.exe, under the installed app’s id', () => {
    const exe = 'C:/Program Files/Fitts/Fitts.exe';
    expect(appDetails({ packaged: true, execPath: exe, argv: [exe], icoPath: ICO })).toEqual({
      appId: APP_ID,
      appIconPath: exe,
      appIconIndex: 0,
      relaunchCommand: `"${exe}"`,
      relaunchDisplayName: 'Fitts',
    });
  });

  it('dev: the .ico file, under its own id, relaunching electron with the app’s arguments', () => {
    const exe = 'C:/fitts/node_modules/electron/dist/electron.exe';
    const d = appDetails({ packaged: false, execPath: exe, argv: [exe, '.'], icoPath: ICO });
    expect(d).toEqual({
      appId: 'app.fitts.desktop.dev',
      appIconPath: ICO,
      relaunchCommand: `"${exe}" "."`,
      relaunchDisplayName: 'Fitts',
    });
    expect(d).not.toHaveProperty('appIconIndex');
  });

  it('the process id matches the window’s in each build', () => {
    expect(appIdFor(true)).toBe('app.fitts.desktop');
    expect(appIdFor(false)).toBe('app.fitts.desktop.dev');
  });
});
