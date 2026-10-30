// A project's dev server (SPEC-phase2 §4.1): spawned with an argument array, logs kept for the
// site-down card, health-checked over localhost. An already-running server is reused.
import type { ChildProcess } from 'node:child_process';
import { killTree, spawnProcess, splitCommand } from '../spawn';

const LOG_LINES = 200;

/** True when something answers HTTP on the URL (any status). Localhost only. */
export async function responds(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    await fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

export class DevServer {
  private child: ChildProcess | undefined;
  private readonly lines: string[] = [];
  private exited = false;

  constructor(
    private readonly folder: string,
    private readonly command: string,
    readonly port: number,
  ) {}

  get url(): string {
    return `http://localhost:${this.port}`;
  }

  get log(): string[] {
    return this.lines.slice(-20);
  }

  private push(chunk: Buffer) {
    for (const line of chunk.toString().split(/\r?\n/)) {
      // Strip ANSI colors so the card shows plain text.
      // eslint-disable-next-line no-control-regex
      const plain = line.replace(/\u001b\[[0-9;]*m/g, '').trimEnd();
      if (plain) this.lines.push(plain);
    }
    if (this.lines.length > LOG_LINES) this.lines.splice(0, this.lines.length - LOG_LINES);
  }

  /** Starts the server unless one already answers on the port; resolves once it's healthy. */
  async start(timeoutMs = 60_000): Promise<boolean> {
    if (await responds(this.url)) return true;
    const [cmd, args] = splitCommand(this.command);
    this.exited = false;
    this.child = spawnProcess(cmd, args, { cwd: this.folder, env: { PORT: String(this.port) } });
    this.child.stdout?.on('data', (d: Buffer) => this.push(d));
    this.child.stderr?.on('data', (d: Buffer) => this.push(d));
    this.child.on('exit', () => {
      this.exited = true;
    });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.exited) return false;
      if (await responds(this.url)) return true;
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  }

  async restart(): Promise<boolean> {
    this.stop();
    await new Promise((r) => setTimeout(r, 500));
    return this.start();
  }

  /** Only servers Fitts started are stopped; a reused one belongs to the user. */
  stop(): void {
    if (this.child) killTree(this.child);
    this.child = undefined;
  }
}
