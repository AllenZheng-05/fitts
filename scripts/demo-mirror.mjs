// pnpm demo:mirror [--push] — exports demo/chat and demo/hartwell as standalone repos for
// AllenZheng-05/fitts-demo-chat and AllenZheng-05/fitts-demo-hartwell (SPEC-phase2 §3).
//
// A plain `git subtree split` isn't enough: the demos depend on @fitts/vite-plugin through the
// workspace and extend the monorepo's tsconfig. Each export vendors the plugin under
// fitts-plugin/ (a `file:` dependency) and inlines the tsconfig, then commits to
// .fitts-dev/mirror/<name>. Without --push nothing leaves this machine.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const push = process.argv.includes('--push');
const OWNER = process.env.FITTS_MIRROR_OWNER ?? 'AllenZheng-05';
const DEMOS = [
  { dir: 'demo/chat', repo: 'fitts-demo-chat' },
  { dir: 'demo/hartwell', repo: 'fitts-demo-hartwell' },
];

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const base = JSON.parse(readFileSync(join(ROOT, 'tsconfig.base.json'), 'utf8')).compilerOptions;

for (const { dir, repo } of DEMOS) {
  const src = join(ROOT, dir);
  const out = join(ROOT, '.fitts-dev', 'mirror', repo);
  const fresh = !existsSync(join(out, '.git'));
  if (fresh) {
    mkdirSync(out, { recursive: true });
    git(out, 'init', '-q', '-b', 'main');
  }
  // Replace the tree (keeping .git) with the current demo.
  for (const entry of execFileSync('git', ['ls-files'], { cwd: out, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)) {
    rmSync(join(out, entry), { force: true });
  }
  cpSync(src, out, {
    recursive: true,
    filter: (p) => !/[\\/](node_modules|dist|\.vite)([\\/]|$)/.test(p),
  });
  mkdirSync(join(out, 'fitts-plugin'), { recursive: true });
  cpSync(join(ROOT, 'packages/vite-plugin/src'), join(out, 'fitts-plugin/src'), {
    recursive: true,
  });
  const pluginPkg = JSON.parse(
    readFileSync(join(ROOT, 'packages/vite-plugin/package.json'), 'utf8'),
  );
  delete pluginPkg.devDependencies;
  delete pluginPkg.scripts;
  writeFileSync(join(out, 'fitts-plugin/package.json'), JSON.stringify(pluginPkg, null, 2) + '\n');

  const pkg = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
  pkg.devDependencies['@fitts/vite-plugin'] = 'file:./fitts-plugin';
  writeFileSync(join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  const ts = JSON.parse(readFileSync(join(out, 'tsconfig.json'), 'utf8'));
  delete ts.extends;
  ts.compilerOptions = { ...base, ...ts.compilerOptions };
  writeFileSync(join(out, 'tsconfig.json'), JSON.stringify(ts, null, 2) + '\n');
  writeFileSync(join(out, '.gitignore'), 'node_modules/\ndist/\n.fitts-worktrees/\n');

  git(out, 'add', '-A');
  const dirty = git(out, 'status', '--porcelain');
  if (dirty) {
    const sha = git(ROOT, 'rev-parse', '--short', 'HEAD');
    git(out, '-c', 'user.name=Allen Zheng', 'commit', '-qm', `Sync from fitts@${sha}`);
  }
  console.log(`${repo}: ${dirty ? 'committed' : 'up to date'} at ${out}`);

  if (push) {
    const url = `https://github.com/${OWNER}/${repo}.git`;
    const remotes = git(out, 'remote');
    if (!remotes.split('\n').includes('origin')) git(out, 'remote', 'add', 'origin', url);
    execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: out, stdio: 'inherit' });
  } else {
    console.log(
      `  to publish: gh repo create ${OWNER}/${repo} --public && pnpm demo:mirror --push`,
    );
  }
}
