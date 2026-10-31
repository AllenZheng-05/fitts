// API keys (SPEC-phase2 §15): encrypted per value with safeStorage in userData/secrets.json.
// The renderer only learns whether a key exists; values go to the agent process, which makes
// the provider calls.
//
// Dev builds only (never packaged): a key saved in Settings wins; otherwise the repo's
// .env.local is used, read with dotenv's parser so nothing leaks into process.env or logs.
// Settings and Welcome show which key is in use (its last 4 characters) and where it came from,
// so a key from .env.local is never a hidden fallback. The file is never copied anywhere.
import type { KeyInfo, KeyName } from '@fitts/schema';
import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { devRepoRoot } from '../dev-root';
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
  private devVoiceId: string | undefined;

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

  /** A sign-in's tokens (GitHub), kept encrypted beside the keys. Main only. */
  token(name: 'github'): string | undefined {
    const stored = this.read()[`token:${name}`];
    if (!stored) return undefined;
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    } catch {
      return undefined;
    }
  }

  setToken(name: 'github', value: string | null): void {
    const all = this.read();
    if (value === null) delete all[`token:${name}`];
    else {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('OS encryption is unavailable');
      all[`token:${name}`] = safeStorage.encryptString(value).toString('base64');
    }
    writeFileSync(this.file, JSON.stringify(all, null, 2));
  }

  /** Per key: is there one, its last 4 characters, and where it's from. Never the value. */
  info(): Record<KeyName, KeyInfo> {
    const stored = this.read();
    return Object.fromEntries(
      KEY_NAMES.map((n) => {
        const v = this.get(n);
        const info: KeyInfo = v
          ? { saved: true, last4: v.slice(-4), source: stored[n] ? 'settings' : 'env' }
          : { saved: false };
        return [n, info];
      }),
    ) as Record<KeyName, KeyInfo>;
  }

  /** Dev only: the ElevenLabs voice from .env.local, for Settings to fill in. */
  envDefaults(): { voiceId?: string } {
    this.dev();
    return this.devVoiceId ? { voiceId: this.devVoiceId } : {};
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
    const root = devRepoRoot();
    const file = root ? join(root, '.env.local') : undefined;
    if (!file || !existsSync(file)) return this.devFallback;
    const env = parse(readFileSync(file));
    for (const n of KEY_NAMES) {
      const v = env[ENV_NAMES[n]]?.trim();
      if (v) this.devFallback[n] = v;
    }
    const voice = env['ELEVENLABS_VOICE_ID']?.trim();
    if (voice && /^[A-Za-z0-9]{8,40}$/.test(voice)) this.devVoiceId = voice;
    return this.devFallback;
  }
}
