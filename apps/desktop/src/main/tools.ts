// What's installed on this computer (Welcome's chips): git, the signed-in GitHub account, and
// Node. Checked once per launch with the spawner; `gh api user` is gh's own network call.
import { IPC, type ToolsStatus } from '@fitts/schema';
import { ipcMain } from 'electron';
import { homedir } from 'node:os';
import { run } from './spawn';

const version = (text: string) => /(\d+(?:\.\d+)*)/.exec(text)?.[1] ?? null;

export async function checkTools(): Promise<ToolsStatus> {
  // Tests never reach the network: offline, gh isn't asked who's signed in.
  const offline = process.env['FITTS_OFFLINE'] === '1';
  const [git, gh, node] = await Promise.all([
    run('git', ['--version'], { cwd: homedir(), timeoutMs: 5000 }),
    offline
      ? Promise.resolve({ code: 1, stdout: '', stderr: '' })
      : run('gh', ['api', 'user', '--jq', '.login'], { cwd: homedir(), timeoutMs: 10_000 }),
    run('node', ['--version'], { cwd: homedir(), timeoutMs: 5000 }),
  ]);
  return {
    git: git.code === 0 ? version(git.stdout) : null,
    gh: gh.code === 0 ? gh.stdout.trim() || null : null,
    node: node.code === 0 ? (version(node.stdout)?.split('.')[0] ?? null) : null,
  };
}

export function registerTools(): void {
  let checked: Promise<ToolsStatus> | undefined;
  ipcMain.handle(IPC.toolsCheck, () => (checked ??= checkTools()));
}
