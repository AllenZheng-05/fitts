// adb and the emulator (SPEC-phase4 §9.2): local processes only, no network. The tools come from
// ANDROID_HOME / ANDROID_SDK_ROOT / PATH. Every adb call goes through one runner (argument arrays,
// binary-safe output), which tests replace with a fake adb.
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { delimiter, join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { killTree, spawnProcess } from '../spawn';

export interface AdbResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

export type AdbRunner = (args: string[], timeoutMs?: number) => Promise<AdbResult>;

const exe = (name: string) => (process.platform === 'win32' ? `${name}.exe` : name);

/** Where the SDK's tool lives: ANDROID_HOME, ANDROID_SDK_ROOT, then PATH. */
export function findTool(
  tool: 'adb' | 'emulator',
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const sub = tool === 'adb' ? 'platform-tools' : 'emulator';
  for (const root of [env['ANDROID_HOME'], env['ANDROID_SDK_ROOT']]) {
    if (!root) continue;
    const p = join(root, sub, exe(tool));
    if (existsSync(p)) return p;
  }
  for (const dir of (env['PATH'] ?? '').split(delimiter)) {
    if (!dir) continue;
    const p = join(dir, exe(tool));
    if (existsSync(p)) return p;
  }
  return undefined;
}

/** The real runner: the adb binary, collecting stdout as bytes (screencap is a PNG). */
export function adbRunner(adb: string, serial?: string): AdbRunner {
  return (args, timeoutMs = 20_000) =>
    new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let stderr = '';
      let child: ChildProcess;
      try {
        child = spawnProcess(adb, serial ? ['-s', serial, ...args] : args, { cwd: process.cwd() });
      } catch (e) {
        resolve({ code: -1, stdout: Buffer.alloc(0), stderr: (e as Error).message });
        return;
      }
      const timer = setTimeout(() => killTree(child), timeoutMs);
      child.stdout?.on('data', (d: Buffer) => chunks.push(d));
      child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
      child.on('error', (e) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout: Buffer.concat(chunks), stderr: stderr + e.message });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout: Buffer.concat(chunks), stderr });
      });
    });
}

/** `input text` escaping: spaces as %s, and the shell's specials escaped. */
export function inputText(text: string): string {
  return text.replace(/([\\"'`$&|;<>()*?!#~{}[\]])/g, '\\$1').replace(/ /g, '%s');
}

/** The Expo app's slug and URL scheme (app.json), for the dev client URL and deep links. */
export function readAppJson(folder: string): { slug: string; scheme?: string; appId?: string } {
  try {
    const app = JSON.parse(readFileSync(join(folder, 'app.json'), 'utf8')) as {
      expo?: { slug?: string; scheme?: string; android?: { package?: string } };
    };
    return {
      slug: app.expo?.slug ?? 'app',
      ...(app.expo?.scheme ? { scheme: app.expo.scheme } : {}),
      ...(app.expo?.android?.package ? { appId: app.expo.android.package } : {}),
    };
  } catch {
    return { slug: 'app' };
  }
}

/**
 * Boots the first AVD (or FITTS_AVD) and waits for it, up to three minutes. The emulator runs on
 * its own: it stays up after Fitts closes, like one started from Android Studio.
 */
export async function bootEmulator(adbPath: string): Promise<string | undefined> {
  const emulator = findTool('emulator');
  if (!emulator) return undefined;
  const avds = await new Promise<string[]>((resolve) => {
    let out = '';
    const p = spawn(emulator, ['-list-avds'], { windowsHide: true });
    p.stdout.on('data', (d: Buffer) => (out += d.toString()));
    p.on('close', () =>
      resolve(
        out
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
      ),
    );
    p.on('error', () => resolve([]));
  });
  const avd = process.env['FITTS_AVD'] ?? avds[0];
  if (!avd) return undefined;
  spawn(emulator, ['-avd', avd, '-no-snapshot-save'], { detached: true, stdio: 'ignore' }).unref();
  const adb = new Adb(adbRunner(adbPath));
  for (const end = Date.now() + 180_000; Date.now() < end;) {
    await new Promise((r) => setTimeout(r, 3000));
    const serial = (await adb.devices())[0];
    if (serial && (await new Adb(adbRunner(adbPath, serial)).booted())) return serial;
  }
  return undefined;
}

/** The adb operations Fitts uses on one device. */
export class Adb {
  constructor(private readonly run: AdbRunner) {}

  async devices(): Promise<string[]> {
    const r = await this.run(['devices']);
    return r.stdout
      .toString()
      .split(/\r?\n/)
      .slice(1)
      .map((l) => l.trim().split(/\s+/))
      .filter((p) => p[1] === 'device')
      .map((p) => p[0] ?? '');
  }

  async booted(): Promise<boolean> {
    const r = await this.run(['shell', 'getprop', 'sys.boot_completed']);
    return r.stdout.toString().trim() === '1';
  }

  /** The screen density in dpi (`wm density`; an override wins). */
  async density(): Promise<number> {
    const out = (await this.run(['shell', 'wm', 'density'])).stdout.toString();
    const m = /Override density:\s*(\d+)/.exec(out) ?? /Physical density:\s*(\d+)/.exec(out);
    return m ? Number(m[1]) : 420;
  }

  async size(): Promise<{ width: number; height: number }> {
    const out = (await this.run(['shell', 'wm', 'size'])).stdout.toString();
    const m = /(\d+)x(\d+)/.exec(out.split(/\r?\n/).filter(Boolean).pop() ?? '');
    return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1080, height: 2400 };
  }

  /** The UI hierarchy as XML (`uiautomator dump` to the terminal). */
  /**
   * uiautomator allows one connection at a time: a second dump while one runs comes back as just
   * "Killed" (seen on Fitts_Pixel, Nov 2). Dumps go one after another, and one that isn't XML
   * (killed, or "could not get idle state") is tried again.
   */
  dump(): Promise<string> {
    const next = this.dumping.then(() => this.dumpOnce());
    this.dumping = next.catch(() => undefined);
    return next;
  }

  private dumping: Promise<unknown> = Promise.resolve();

  private async dumpOnce(): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await this.run(['exec-out', 'uiautomator', 'dump', '/dev/tty'], 15_000);
      const text = r.stdout.toString();
      const end = text.lastIndexOf('</hierarchy>');
      if (end >= 0) return text.slice(text.indexOf('<?xml'), end + '</hierarchy>'.length);
      await new Promise((res) => setTimeout(res, 300));
    }
    return '';
  }

  /** A PNG of the screen. */
  async screencap(): Promise<Buffer> {
    return (await this.run(['exec-out', 'screencap', '-p'], 15_000)).stdout;
  }

  async tap(x: number, y: number): Promise<void> {
    await this.run(['shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))]);
  }

  async text(text: string): Promise<void> {
    await this.run(['shell', 'input', 'text', inputText(text)]);
  }

  async key(code: string): Promise<void> {
    await this.run(['shell', 'input', 'keyevent', code]);
  }

  async swipe(x1: number, y1: number, x2: number, y2: number, ms = 300): Promise<void> {
    await this.run([
      'shell',
      'input',
      'swipe',
      ...[x1, y1, x2, y2, ms].map((n) => String(Math.round(n))),
    ]);
  }

  /** Lets the device reach the dev server on this machine's port. */
  async reverse(port: number): Promise<boolean> {
    return (await this.run(['reverse', `tcp:${port}`, `tcp:${port}`])).code === 0;
  }

  /** Opens a URL in the app that handles it (the Expo dev client). */
  async open(url: string): Promise<boolean> {
    // adb joins shell arguments into one remote command: the URL is quoted for the device's shell.
    const quoted = `'${url.replace(/'/g, '')}'`;
    const r = await this.run([
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      quoted,
    ]);
    return r.code === 0 && !/Error/.test(r.stdout.toString());
  }

  /** The focused activity ("com.basilandember.order/.MainActivity"). */
  async activity(): Promise<string> {
    const out = (await this.run(['shell', 'dumpsys', 'window'])).stdout.toString();
    const m = /mCurrentFocus=Window\{[^ ]+ [^ ]+ ([^}]+)\}/.exec(out);
    return m?.[1] ?? '';
  }
}
