// Child processes (SPEC-phase2 §15): argument arrays, never shell strings; the working folder is
// validated by the caller; ELECTRON_RUN_AS_NODE is always stripped (Phase 1 M0).
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';

/** Package-manager launchers that are .cmd shims on Windows. */
const CMD_SHIMS = new Set(['pnpm', 'npm', 'npx', 'yarn', 'bun']);

/** Tokens that may go through cmd.exe on Windows: no quotes, spaces or shell metacharacters. */
const SAFE_TOKEN = /^[\w@:./=+,-]+$/;

export function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete env['ELECTRON_RUN_AS_NODE'];
  return env;
}

export interface SpawnOptions {
  cwd: string;
  env?: Record<string, string>;
}

/**
 * Starts `cmd args…` without a shell. On Windows, npm-style launchers are .cmd shims that Node
 * can only start through cmd.exe, so those go through `cmd /d /s /c` with every token checked
 * against SAFE_TOKEN first.
 */
export function spawnProcess(cmd: string, args: string[], opts: SpawnOptions): ChildProcess {
  const env = cleanEnv(opts.env);
  if (process.platform === 'win32' && CMD_SHIMS.has(cmd)) {
    for (const token of [cmd, ...args]) {
      if (!SAFE_TOKEN.test(token)) throw new Error(`unsafe argument: ${token}`);
    }
    return spawn(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/s', '/c', cmd, ...args], {
      cwd: opts.cwd,
      env,
      windowsHide: true,
    });
  }
  return spawn(cmd, args, { cwd: opts.cwd, env, windowsHide: true });
}

/** Runs to completion and captures output. */
export function run(
  cmd: string,
  args: string[],
  opts: SpawnOptions & { timeoutMs?: number },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child: ChildProcess;
    try {
      child = spawnProcess(cmd, args, opts);
    } catch (e) {
      resolve({ code: -1, stdout: '', stderr: (e as Error).message });
      return;
    }
    const timer = setTimeout(() => killTree(child), opts.timeoutMs ?? 30_000);
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/**
 * Ends a process and everything it started (dev servers spawn their own children). Synchronous,
 * so it still finishes when called while the app is quitting.
 */
export function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      // Already gone.
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

/** Splits a dev command like "pnpm dev" or "npm run dev" into a command and arguments. */
export function splitCommand(command: string): [string, string[]] {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  const [cmd = 'npm', ...args] = parts;
  return [cmd, args];
}
