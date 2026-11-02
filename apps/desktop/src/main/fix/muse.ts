// Muse Code (SPEC-phase4 §7.4): Meta's coding agent as a fixer. Found natively or through WSL;
// signed in by Fitts itself with the owner's Meta key on stdin (`--api-key-stdin`, then stdin is
// closed): never in argv, env, a file, a log line or the event log. Every run gets
// `--disable-web-tools --disable-request-user-input --no-session-log` (Allen, Nov 1), so nothing
// reaches the web, nothing waits for a person and no session log stays on disk. The in-process
// fixer stays what runs unless Muse Code is chosen and ready; any failure falls back to it.
import type { ChildProcess } from 'node:child_process';
import { killTree, run, spawnProcess } from '../spawn';

export type MuseVia = 'native' | 'wsl';
export interface MuseStatus {
  status: 'ready' | 'not-installed' | 'no-wsl' | 'too-old' | 'failed';
  via?: MuseVia;
  version?: string;
  error?: string;
}

/** Flags every Fitts run of `muse exec` carries. */
export const MUSE_SAFE_FLAGS = [
  '--disable-web-tools',
  '--disable-request-user-input',
  '--no-session-log',
];

/** The command line for `muse <args>` natively, or inside WSL's login shell (for its PATH). */
export function museCommand(
  via: MuseVia,
  args: string[],
  cwd?: string,
): { cmd: string; args: string[] } {
  if (via === 'native') return { cmd: 'muse', args };
  // `bash -lc 'muse "$@"' muse a b c`: the arguments are bash's positional parameters, never
  // interpolated into the command string.
  return {
    cmd: 'wsl',
    args: [...(cwd ? ['--cd', cwd] : []), '-e', 'bash', '-lc', 'muse "$@"', 'muse', ...args],
  };
}

const firstLine = (s: string) =>
  s
    .split(/\r?\n/)
    .find((l) => l.trim())
    ?.trim()
    .slice(0, 160) ?? '';

/** Finds Muse Code and checks it can take the key on stdin. */
export async function museStatus(
  runner: typeof run = run,
  platform: NodeJS.Platform = process.platform,
): Promise<MuseStatus> {
  const tryVia = async (via: MuseVia): Promise<MuseStatus | null> => {
    const v = museCommand(via, ['--version']);
    const res = await runner(v.cmd, v.args, { cwd: process.cwd(), timeoutMs: 15_000 });
    if (res.code !== 0) return null;
    const version = /(\d+\.\d+\.\d+)/.exec(res.stdout + res.stderr)?.[1];
    const h = museCommand(via, ['exec', '--help']);
    const help = await runner(h.cmd, h.args, { cwd: process.cwd(), timeoutMs: 15_000 });
    if (!/--api-key-stdin/.test(help.stdout + help.stderr))
      return { status: 'too-old', via, ...(version ? { version } : {}) };
    return { status: 'ready', via, ...(version ? { version } : {}) };
  };
  try {
    const native = await tryVia('native');
    if (native) return native;
    if (platform !== 'win32') return { status: 'not-installed' };
    const hasWsl = await runner('wsl', ['--status'], { cwd: process.cwd(), timeoutMs: 15_000 });
    if (
      hasWsl.code !== 0 &&
      /not (installed|recognized)|no installed distributions/i.test(hasWsl.stdout + hasWsl.stderr)
    )
      return { status: 'no-wsl' };
    return (await tryVia('wsl')) ?? { status: 'not-installed' };
  } catch (e) {
    return { status: 'failed', error: firstLine((e as Error).message) };
  }
}

export interface MuseRun extends MuseTally {
  code: number;
  /** The JSONL events Muse Code printed (`--json`). */
  events: Record<string, unknown>[];
  /** Exit 1 or an auth message: Muse Code couldn't sign in. */
  authFailed: boolean;
  error?: string;
}

/** What a run's events add up to. */
export interface MuseTally {
  usage: { input: number; output: number; cached: number; reasoning: number };
  summary: string;
  /** The last message in full (with --output-schema, the JSON answer). */
  final: string;
}

/**
 * One `--json` event into the tally. Muse Code's envelope puts the kind in `payload_type` and the
 * data in `payload`. `run.usage` carries the run's totals so far (per model, with call counts), so
 * the latest one wins; `run.terminal.completed` carries the final answer.
 */
export function readMuseEvent(t: MuseTally, e: Record<string, unknown>): void {
  const p = e['payload'];
  if (!p || typeof p !== 'object') return;
  const payload = p as Record<string, unknown>;
  const models = payload['models'];
  if (e['payload_type'] === 'run.usage' && Array.isArray(models)) {
    const sum = (k: string) =>
      (models as Record<string, unknown>[]).reduce((n, m) => n + (Number(m[k]) || 0), 0);
    t.usage = {
      input: sum('input_tokens'),
      output: sum('output_tokens'),
      cached: sum('cached_tokens'),
      reasoning: sum('reasoning_tokens'),
    };
  }
  const text = payload['text'];
  if (e['payload_type'] === 'run.terminal.completed' && typeof text === 'string' && text) {
    t.final = text;
    t.summary = text.slice(0, 600);
  }
}

/**
 * One `muse exec` in a worktree. The Meta key goes to stdin, which is then closed; JSONL events
 * stream to `onEvent` (for the Now line); usage adds up for the ledger. Killed on `signal`, at
 * `timeoutMs`, or when the budget card stops the run.
 */
export function museExec(opts: {
  via: MuseVia;
  cwd: string;
  /** Relative to cwd (a file next to the worktree, never inside the user's repo). */
  promptFile: string;
  apiKey: string | undefined;
  model?: string;
  maxSteps?: number;
  outputSchema?: string;
  onEvent?: (e: Record<string, unknown>) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<MuseRun> {
  const args = [
    'exec',
    '--json',
    '--model',
    opts.model ?? 'muse-wonder-1.0',
    '--approval-mode',
    'never',
    // The sandbox is on by default (shell filesystem and network, network proxy-only); 1.4.14's
    // help lists --sandbox-network without its values, so the default stands.
    '--max-model-steps',
    String(opts.maxSteps ?? 40),
    ...MUSE_SAFE_FLAGS,
    ...(opts.apiKey ? ['--api-key-stdin'] : []),
    ...(opts.outputSchema ? ['--output-schema', opts.outputSchema] : []),
    '--prompt-file',
    opts.promptFile,
  ];
  const c = museCommand(opts.via, args, opts.via === 'wsl' ? opts.cwd : undefined);
  return new Promise((resolve) => {
    const events: Record<string, unknown>[] = [];
    const tally: MuseTally = {
      usage: { input: 0, output: 0, cached: 0, reasoning: 0 },
      summary: '',
      final: '',
    };
    let stderr = '';
    let buffer = '';
    let child: ChildProcess;
    try {
      child = spawnProcess(c.cmd, c.args, { cwd: opts.cwd });
    } catch (e) {
      resolve({
        code: -1,
        events,
        ...tally,
        authFailed: false,
        error: firstLine((e as Error).message),
      });
      return;
    }
    // The key, then end of input: the only place a key leaves Secrets for a child process.
    if (opts.apiKey) child.stdin?.write(opts.apiKey);
    child.stdin?.end();
    const stop = () => killTree(child);
    const timer = setTimeout(stop, opts.timeoutMs ?? 15 * 60_000);
    opts.signal?.addEventListener('abort', stop, { once: true });
    child.stdout?.on('data', (d: Buffer) => {
      buffer += d.toString();
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('{')) continue;
        try {
          const e = JSON.parse(line) as Record<string, unknown>;
          events.push(e);
          readMuseEvent(tally, e);
          opts.onEvent?.(e);
        } catch {
          // Not JSON: Muse Code's own progress text.
        }
      }
    });
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    const done = (code: number) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', stop);
      const authFailed =
        code === 1 && /credential|api key|unauthori[sz]ed|sign ?in|login/i.test(stderr);
      resolve({
        code,
        events,
        ...tally,
        authFailed: authFailed || (code === 1 && events.length === 0),
        ...(code !== 0 ? { error: firstLine(stderr) || `muse exited ${code}` } : {}),
      });
    };
    child.on('error', (e) => {
      stderr += e.message;
      done(-1);
    });
    child.on('close', (code) => done(code ?? -1));
  });
}
