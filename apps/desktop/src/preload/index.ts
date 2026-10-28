import { contextBridge } from 'electron';
import type { FittsBridge, Platform } from '@fitts/schema';

const bridge: FittsBridge = {
  platform: process.platform as Platform,
};

contextBridge.exposeInMainWorld('fitts', bridge);
