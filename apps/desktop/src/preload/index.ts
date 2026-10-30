import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type Detection,
  type EngineEvents,
  type FittsBridge,
  type KeyName,
  type Platform,
  type RunState,
  type SiteRect,
  type SiteStatus,
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
  site: {
    detect: (folder) => ipcRenderer.invoke(IPC.siteDetect, folder) as Promise<Detection | null>,
    open: (projectId) => ipcRenderer.send(IPC.siteOpen, projectId),
    close: (projectId) => ipcRenderer.send(IPC.siteClose, projectId),
    resize: (projectId, width, height) =>
      ipcRenderer.send(IPC.siteResize, projectId, width, height),
    input: (projectId, input) => ipcRenderer.send(IPC.siteInput, projectId, input),
    nav: (projectId, nav) => ipcRenderer.send(IPC.siteNav, projectId, nav),
    rects: (projectId, refs) =>
      ipcRenderer.invoke(IPC.siteRects, projectId, refs) as Promise<Record<string, SiteRect>>,
    refAt: (projectId, x, y) =>
      ipcRenderer.invoke(IPC.siteRefAt, projectId, x, y) as Promise<string | null>,
    elementAt: (projectId, x, y) =>
      ipcRenderer.invoke(IPC.siteElementAt, projectId, x, y) as Promise<{
        ref: string;
        label: string;
      } | null>,
    onFrame: (projectId, handler) => {
      const listener = (_e: unknown, id: string, jpeg: Uint8Array, w: number, h: number) => {
        if (id === projectId) handler(jpeg, w, h);
      };
      ipcRenderer.on(IPC.siteFrame, listener);
      return () => ipcRenderer.removeListener(IPC.siteFrame, listener);
    },
    onStatus: (handler) => {
      const listener = (_e: unknown, status: SiteStatus) => handler(status);
      ipcRenderer.on(IPC.siteStatus, listener);
      return () => ipcRenderer.removeListener(IPC.siteStatus, listener);
    },
  },
};

contextBridge.exposeInMainWorld('fitts', bridge);
