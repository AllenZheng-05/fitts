// V6: `muse exec` through WSL on a throwaway repo — flags, JSONL events, exit code, the edit.
// Muse uses its own `muse login`; no API key is passed. `--echo` checks the plumbing with
// muse's echo provider (no credentials, no spend).
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canSpend, log, recordSpend, ROOT, saveResult } from './_lib';

const echo = process.argv.includes('--echo');
const dir = join(ROOT, '.fitts-dev', 'verify', 'museprobe');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'app.js'), 'export const label = "NEXT";\n');
const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
git('init', '-q');
git('add', '.');
git('-c', 'user.email=fitts@local', '-c', 'user.name=fitts', 'commit', '-qm', 'init');
writeFileSync(
  join(dir, '..', 'muse-task.md'),
  'In app.js, change the label from "NEXT" to "Send". Change nothing else.\n',
);

/** C:\a\b → /mnt/c/a/b. Backslashes don't survive being passed into WSL as arguments. */
const wslPath = (p: string) =>
  p.replace(/^([A-Za-z]):[\\/]/, (_m, d: string) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, '/');
const repoW = wslPath(dir);
const taskW = wslPath(join(dir, '..', 'muse-task.md'));
const flags = [
  '--json',
  ...(echo ? ['--provider', 'echo'] : ['--model', 'muse-spark-1.3-contributor']),
  '--approval-mode',
  'never',
  '--sandbox-network',
  'restricted',
  '--max-model-steps',
  '12',
  ...(echo ? [] : ['--reasoning-effort', 'low']),
  '--prompt-file',
  `'${taskW}'`,
];
if (!echo && !canSpend(0.05)) process.exit(0);

const env: NodeJS.ProcessEnv = { ...process.env, MSYS_NO_PATHCONV: '1' };
delete env['ELECTRON_RUN_AS_NODE'];
const started = Date.now();
const child = spawn('wsl', ['-e', 'bash', '-lc', `cd '${repoW}' && muse exec ${flags.join(' ')}`], {
  env,
});
let stdout = '';
let stderr = '';
child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
const code: number = await new Promise((r) => child.on('close', (c) => r(c ?? -1)));

const events = stdout
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l) as { payload_type?: string; payload?: Record<string, unknown> };
    } catch {
      return { payload_type: 'unparsed' };
    }
  });
const result = {
  provider: echo ? 'echo' : 'meta',
  exitCode: code,
  ms: Date.now() - started,
  eventCount: events.length,
  types: [...new Set(events.map((e) => e.payload_type ?? '?'))],
  usage: events.filter((e) => e.payload_type === 'run.usage').map((e) => e.payload),
  terminal: events.filter((e) => e.payload_type?.startsWith('run.terminal')).map((e) => e.payload),
  stderr: stderr.slice(0, 1500),
  fileAfter: readFileSync(join(dir, 'app.js'), 'utf8'),
};
if (!echo) recordSpend('v6', 0.01, 'muse exec contributor');
log(result);
saveResult(echo ? 'v6-muse-echo' : 'v6-muse', result);
