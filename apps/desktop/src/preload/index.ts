import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type Detection,
  type EngineEvents,
  type FittsBridge,
  type GitHubStatus,
  type HostSites,
  type KeyInfo,
  type KeyName,
  type Platform,
  type RunState,
  type PointedElement,
  type SiteRect,
  type SiteStatus,
  type VoiceEvent,
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
    info: () => ipcRenderer.invoke(IPC.keysInfo) as Promise<Record<KeyName, KeyInfo>>,
    envDefaults: () => ipcRenderer.invoke(IPC.keysEnvDefaults) as Promise<{ voiceId?: string }>,
  },
  site: {
    detect: (folder) => ipcRenderer.invoke(IPC.siteDetect, folder) as Promise<Detection | null>,
    open: (projectId) => ipcRenderer.send(IPC.siteOpen, projectId),
    close: (projectId) => ipcRenderer.send(IPC.siteClose, projectId),
    openVersion: (siteId, projectId, runId, version) =>
      ipcRenderer.send(IPC.siteOpenVersion, siteId, projectId, runId, version),
    openInBrowser: (siteId) => ipcRenderer.send(IPC.siteOpenInBrowser, siteId),
    resize: (projectId, width, height) =>
      ipcRenderer.send(IPC.siteResize, projectId, width, height),
    device: (projectId, device) => ipcRenderer.send(IPC.siteDevice, projectId, device?.id ?? null),
    input: (projectId, input) => ipcRenderer.send(IPC.siteInput, projectId, input),
    nav: (projectId, nav) => ipcRenderer.send(IPC.siteNav, projectId, nav),
    tab: (projectId, action) => ipcRenderer.send(IPC.siteTab, projectId, action),
    rects: (projectId, refs) =>
      ipcRenderer.invoke(IPC.siteRects, projectId, refs) as Promise<Record<string, SiteRect>>,
    refAt: (projectId, x, y) =>
      ipcRenderer.invoke(IPC.siteRefAt, projectId, x, y) as Promise<PointedElement | null>,
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
  verify: {
    check: (method, domain, token) =>
      ipcRenderer.invoke(IPC.verifyCheck, method, domain, token) as Promise<{
        ok: boolean;
        message: string;
        offline?: boolean;
      }>,
    githubPages: () =>
      ipcRenderer.invoke(IPC.verifyPages) as ReturnType<
        NonNullable<FittsBridge['verify']>['githubPages']
      >,
    hostConnect: (host, token) =>
      ipcRenderer.invoke(IPC.hostConnect, host, token) as Promise<HostSites>,
    hostSites: (host) => ipcRenderer.invoke(IPC.hostSites, host) as Promise<HostSites>,
    hostForget: (host) => ipcRenderer.send(IPC.hostForget, host),
  },
  openLink: (url) => ipcRenderer.send(IPC.openLink, url),
  github: {
    status: () => ipcRenderer.invoke(IPC.githubStatus) as Promise<GitHubStatus>,
    signIn: () => ipcRenderer.invoke(IPC.githubSignIn) as Promise<GitHubStatus>,
    cancel: () => ipcRenderer.send(IPC.githubCancel),
    signOut: () => ipcRenderer.send(IPC.githubSignOut),
    onStatus: (handler) => {
      const listener = (_e: unknown, status: GitHubStatus) => handler(status);
      ipcRenderer.on(IPC.githubEvent, listener);
      return () => ipcRenderer.removeListener(IPC.githubEvent, listener);
    },
  },
  installPlugin: (projectId) =>
    ipcRenderer.invoke(IPC.pluginInstall, projectId) as ReturnType<
      NonNullable<FittsBridge['installPlugin']>
    >,
  finishRun: (projectId, runId) =>
    ipcRenderer.invoke(IPC.runFinish, projectId, runId) as Promise<void>,
  tools: () => ipcRenderer.invoke(IPC.toolsCheck) as ReturnType<NonNullable<FittsBridge['tools']>>,
  voice: {
    start: (mode, projectId) =>
      ipcRenderer.invoke(IPC.voiceStart, mode, projectId) as Promise<{
        ok: boolean;
        reason?: string;
        session?: number;
      }>,
    audio: (session, pcm) => ipcRenderer.send(IPC.voiceAudioIn, session, pcm),
    end: (session) => ipcRenderer.send(IPC.voiceEnd, session),
    cancel: (session) => ipcRenderer.send(IPC.voiceCancel, session),
    speak: (text, voiceId, projectId) =>
      ipcRenderer.invoke(IPC.voiceSpeak, text, voiceId, projectId) as Promise<{
        ok: boolean;
        id: number;
      }>,
    stopSpeaking: () => ipcRenderer.send(IPC.voiceStopSpeaking),
    onEvent: (handler) => {
      const listener = (_e: unknown, event: VoiceEvent) => handler(event);
      ipcRenderer.on(IPC.voiceEvent, listener);
      return () => ipcRenderer.removeListener(IPC.voiceEvent, listener);
    },
    onAudio: (handler) => {
      const listener = (_e: unknown, id: number, pcm: ArrayBuffer) => handler(id, pcm);
      ipcRenderer.on(IPC.voiceAudio, listener);
      return () => ipcRenderer.removeListener(IPC.voiceAudio, listener);
    },
  },
};

contextBridge.exposeInMainWorld('fitts', bridge);
