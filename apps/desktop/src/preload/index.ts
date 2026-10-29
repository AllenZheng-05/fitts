import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type EngineEvents,
  type FittsBridge,
  type KeyName,
  type Platform,
  type RunState,
} from '@fitts/schema';

const bridge: FittsBridge = {
  platform: process.platform as Platform,
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder) as Promise<string | null>,
  saveTextFile: (suggestedName, content) =>
    ipcRenderer.invoke(IPC.saveTextFile, suggestedName, content) as Promise<string | null>,
  notify: (notification) => ipcRenderer.send(IPC.notify, notification),
  onNotificationClick: (handler) => {
    const listener = (_event: unknown, id: string) => handler(id);
    ipcRenderer.on(IPC.notificationClick, listener);
    return () => ipcRenderer.removeListener(IPC.notificationClick, listener);
  },
  engine: {
    call: (call) => ipcRenderer.send(IPC.engineCall, call),
    onEvents: (handler) => {
      const listener = (_event: unknown, batch: EngineEvents) => handler(batch);
      ipcRenderer.on(IPC.engineEvents, listener);
      return () => ipcRenderer.removeListener(IPC.engineEvents, listener);
    },
    states: () => ipcRenderer.invoke(IPC.engineStates) as Promise<Record<string, RunState>>,
  },
  store: {
    loadProjects: () => ipcRenderer.sendSync(IPC.projectsLoad) as string | null,
    saveProjects: (blob) => ipcRenderer.send(IPC.projectsSave, blob),
  },
  keys: {
    set: (name: KeyName, value: string) =>
      ipcRenderer.invoke(IPC.keysSet, name, value) as Promise<void>,
    clear: (name: KeyName) => ipcRenderer.invoke(IPC.keysClear, name) as Promise<void>,
    test: (name: KeyName, value?: string) =>
      ipcRenderer.invoke(IPC.keysTest, name, value) as Promise<{ ok: boolean; message: string }>,
    has: () => ipcRenderer.invoke(IPC.keysHas) as Promise<Record<KeyName, boolean>>,
  },
};

contextBridge.exposeInMainWorld('fitts', bridge);
