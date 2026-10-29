// Messages between main and the agent utility process (process.parentPort).
import type { EngineCall, EngineEvents, KeyName } from '@fitts/schema';

export type MainMessage =
  | { kind: 'call'; call: EngineCall }
  /** The current API keys (from safeStorage, or .env.local in dev builds). */
  | { kind: 'keys'; keys: Partial<Record<KeyName, string>> }
  | { kind: 'testKey'; id: number; name: KeyName; value: string };

export type AgentMessage =
  | { kind: 'ready' }
  | { kind: 'events'; batch: EngineEvents }
  | { kind: 'keyResult'; id: number; ok: boolean; message: string }
  | { kind: 'error'; message: string };
