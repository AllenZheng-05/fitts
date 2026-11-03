// Windows' taskbar identity (no Electron imports, so it's unit-tested): the AppUserModelID that
// groups the buttons, and the relaunch details the Windows 11 taskbar takes a button's icon from.

/** Windows groups taskbar buttons by this id. */
export const APP_ID = 'app.fitts.desktop';

/**
 * Dev gets its own id, so a dev run never caches electron.exe's icon under the installed app's.
 */
export const appIdFor = (packaged: boolean): string => (packaged ? APP_ID : `${APP_ID}.dev`);

export interface AppDetails {
  appId: string;
  appIconPath: string;
  appIconIndex?: number;
  relaunchCommand: string;
  relaunchDisplayName: string;
}

/**
 * Packaged, the .ico is inside app.asar, which Explorer can't read, so the taskbar showed
 * Electron's icon: point at Fitts.exe, which has the Fitts icon embedded. In dev the .ico is a
 * real file (and the exe is electron.exe).
 */
export function appDetails(o: {
  packaged: boolean;
  execPath: string;
  argv: string[];
  icoPath: string;
}): AppDetails {
  const quote = (s: string) => `"${s}"`;
  return {
    appId: appIdFor(o.packaged),
    ...(o.packaged ? { appIconPath: o.execPath, appIconIndex: 0 } : { appIconPath: o.icoPath }),
    relaunchCommand: [o.execPath, ...o.argv.slice(1)].map(quote).join(' '),
    relaunchDisplayName: 'Fitts',
  };
}
