// Settings › API keys over IPC (SPEC-phase2 §15). Values only travel renderer → main; the
// renderer never gets one back.
import { IPC, type KeyName } from '@fitts/schema';
import { ipcMain } from 'electron';
import type { RunHost } from './run-host';
import { KEY_NAMES, type Secrets } from './secrets';

const isKeyName = (v: unknown): v is KeyName => KEY_NAMES.includes(v as KeyName);

export function registerKeys(secrets: Secrets, host: RunHost): void {
  ipcMain.handle(IPC.keysSet, (_e, name: unknown, value: unknown) => {
    if (!isKeyName(name) || typeof value !== 'string' || !value.trim()) return;
    secrets.set(name, value.trim());
    host.pushKeys();
  });
  ipcMain.handle(IPC.keysClear, (_e, name: unknown) => {
    if (!isKeyName(name)) return;
    secrets.clear(name);
    host.pushKeys();
  });
  ipcMain.handle(IPC.keysHas, () => secrets.has());
  ipcMain.handle(IPC.keysTest, (_e, name: unknown, value: unknown) => {
    if (!isKeyName(name)) return { ok: false, message: 'Unknown key' };
    const key = typeof value === 'string' && value ? value : secrets.get(name);
    if (!key) return { ok: false, message: 'No key' };
    return host.testKey(name, key);
  });
}
