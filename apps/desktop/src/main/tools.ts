// What's installed on this computer (Welcome's chips): git, the signed-in GitHub account, and
// Node. Checked once per launch with the spawner; `gh api user` is gh's own network call.
import { IPC, type ToolsStatus } from '@fitts/schema';
import { ipcMain } from 'electron';
import { homedir } from 'node:os';
import { run } from './spawn';

const version = (text: string) => /(\d+(?:\.\d+)*)/.exec(text)?.[1] ?? null;

/** `githubLogin`: the account signed in to Fitts with GitHub, which wins over gh's. */
export async function checkTools(githubLogin?: () => string | undefined): Promise<ToolsStatus> {
  const signedIn = githubLogin?.();
  // Tests never reach the network: offline, gh isn't asked who's signed in.
  const offline = process.env['FITTS_OFFLINE'] === '1';
  const [git, gh, node] = await Promise.all([
    run('git', ['--version'], { cwd: homedir(), timeoutMs: 5000 }),
    offline || signedIn
      ? Promise.resolve({ code: 1, stdout: '', stderr: '' })
      : run('gh', ['api', 'user', '--jq', '.login'], { cwd: homedir(), timeoutMs: 10_000 }),
    run('node', ['--version'], { cwd: homedir(), timeoutMs: 5000 }),
  ]);
  return {
    git: git.code === 0 ? version(git.stdout) : null,
    gh: signedIn ?? (gh.code === 0 ? gh.stdout.trim() || null : null),
    node: node.code === 0 ? (version(node.stdout)?.split('.')[0] ?? null) : null,
  };
}

export function registerTools(githubLogin?: () => string | undefined): void {
  let checked: Promise<ToolsStatus> | undefined;
  let checkedAs: string | undefined;
  ipcMain.handle(IPC.toolsCheck, () => {
    // Signing in or out of GitHub changes the answer; the rest is checked once per launch.
    const login = githubLogin?.();
    if (!checked || login !== checkedAs) {
      checkedAs = login;
      checked = checkTools(githubLogin);
    }
    return checked;
  });
}
