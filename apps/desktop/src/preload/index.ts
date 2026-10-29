import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type FittsBridge, type Platform } from '@fitts/schema';

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
};

contextBridge.exposeInMainWorld('fitts', bridge);
