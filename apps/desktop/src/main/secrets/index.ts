// API keys (SPEC-phase2 §15): encrypted per value with safeStorage in userData/secrets.json.
// The renderer only learns whether a key exists; values go to the agent process, which makes
// the provider calls.
//
// Dev builds only (never packaged): if safeStorage has no key, fall back to the repo's
// .env.local, read with dotenv's parser so nothing leaks into process.env or logs.
import type { KeyName } from '@fitts/schema';
import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'dotenv';

export const KEY_NAMES: KeyName[] = ['meta', 'elevenlabs', 'baseten'];
const ENV_NAMES: Record<KeyName, string> = {
  meta: 'META_API_KEY',
  elevenlabs: 'ELEVENLABS_API_KEY',
  baseten: 'BASETEN_API_KEY',
};

export class Secrets {
  private readonly file: string;
  private devFallback: Partial<Record<KeyName, string>> | undefined;

  constructor(root = app.getPath('userData')) {
    this.file = join(root, 'secrets.json');
  }

  private read(): Record<string, string> {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  }

  /** Linux without a keyring stores keys with a fixed key ("basic_text"); Settings warns. */
  get weakStorage(): boolean {
    return process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text';
  }

  set(name: KeyName, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('OS encryption is unavailable');
    const all = this.read();
    all[name] = safeStorage.encryptString(value).toString('base64');
    writeFileSync(this.file, JSON.stringify(all, null, 2));
  }

  clear(name: KeyName): void {
    const all = this.read();
    delete all[name];
    writeFileSync(this.file, JSON.stringify(all, null, 2));
  }

  get(name: KeyName): string | undefined {
    const stored = this.read()[name];
    if (stored) {
      try {
        return safeStorage.decryptString(Buffer.from(stored, 'base64'));
      } catch {
        return undefined;
      }
    }
    return this.dev()[name];
  }

  has(): Record<KeyName, boolean> {
    return Object.fromEntries(KEY_NAMES.map((n) => [n, Boolean(this.get(n))])) as Record<
      KeyName,
      boolean
    >;
  }

  all(): Partial<Record<KeyName, string>> {
    const out: Partial<Record<KeyName, string>> = {};
    for (const n of KEY_NAMES) {
      const v = this.get(n);
      if (v) out[n] = v;
    }
    return out;
  }

  /** Dev only: the repo's .env.local, never in a packaged build or an e2e run. */
  private dev(): Partial<Record<KeyName, string>> {
    if (this.devFallback) return this.devFallback;
    this.devFallback = {};
    if (app.isPackaged || process.env['FITTS_NO_DEV_KEYS'] === '1') return this.devFallback;
    const file = resolve(app.getAppPath(), '..', '..', '.env.local');
    if (!existsSync(file)) return this.devFallback;
    const env = parse(readFileSync(file));
    for (const n of KEY_NAMES) {
      const v = env[ENV_NAMES[n]]?.trim();
      if (v) this.devFallback[n] = v;
    }
    return this.devFallback;
  }
}
