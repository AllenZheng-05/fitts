// A project's CI checks (Allen's feedback: every Fitts PR failed CI on formatting). Fitts reads
// the checks a project's GitHub workflows run on a pull request (lint, formatting, type checks),
// formats the files it changed the way the project does, and runs the same checks in the fix's
// worktree before it opens a PR. Only commands that check code are run, never installs, builds
// or deploys, and only in the shapes below.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CiCheck {
  /** What the user sees: "pnpm lint", "prettier --check .". */
  name: string;
  command: string;
  args: string[];
  /** It checks formatting with Prettier, or lints with ESLint (Fitts formats/fixes first). */
  tool?: 'prettier' | 'eslint';
}

/** Scripts and tools that check code. */
const CHECKY = /(lint|format|prettier|style|typecheck|type-check|types|tsc|check)/i;
const FIXING = /(fix|write)/i;
const MAX_CHECKS = 5;

/** Every `run:` command in the project's workflows, one per line (`a && b` split). */
export function workflowCommands(dir: string): string[] {
  const folder = join(dir, '.github', 'workflows');
  if (!existsSync(folder)) return [];
  const out: string[] = [];
  for (const file of readdirSync(folder).filter((f) => /\.ya?ml$/.test(f))) {
    const lines = readFileSync(join(folder, file), 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)(?:-\s*)?run:\s*(.*)$/.exec(lines[i] ?? '');
      if (!m) continue;
      const value = (m[2] ?? '').trim();
      const block: string[] = [];
      if (/^[|>][-+]?$/.test(value)) {
        const indent = (m[1] ?? '').length;
        for (let j = i + 1; j < lines.length; j++) {
          const line = lines[j] ?? '';
          if (line.trim() && line.length - line.trimStart().length <= indent) break;
          if (line.trim()) block.push(line.trim());
        }
      } else if (value) block.push(value.replace(/^["']|["']$/g, ''));
      for (const line of block)
        for (const part of line.split('&&')) if (part.trim()) out.push(part.trim());
    }
  }
  return out;
}

export type PackageManager = 'pnpm' | 'yarn' | 'npm';

/** The CI checks Fitts can run for a project, from its workflows and package scripts. */
export function ciChecks(dir: string, pm: PackageManager): CiCheck[] {
  let scripts: Record<string, string> = {};
  try {
    scripts =
      (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { scripts?: typeof scripts })
        .scripts ?? {};
  } catch {
    // No package.json: only direct tool commands can run.
  }
  const tool = (text: string) =>
    /\bprettier\b/.test(text) ? 'prettier' : /\beslint\b/.test(text) ? 'eslint' : undefined;
  const out: CiCheck[] = [];
  const add = (c: CiCheck) => {
    if (out.length < MAX_CHECKS && !out.some((o) => o.name === c.name)) out.push(c);
  };
  for (const raw of workflowCommands(dir)) {
    const line = raw.replace(/\s+/g, ' ');
    // `pnpm lint`, `npm run format:check`, `yarn typecheck`
    const script = /^(?:pnpm|npm|yarn)(?: run)? ([\w:.-]+)$/.exec(line)?.[1];
    if (script) {
      const body = scripts[script];
      if (body && CHECKY.test(script) && !FIXING.test(script) && !FIXING.test(body)) {
        const t = tool(body);
        add({
          name: `${pm} ${script}`,
          command: pm,
          args: pm === 'npm' ? ['run', script] : [script],
          ...(t ? { tool: t } : {}),
        });
      }
      continue;
    }
    // `npx prettier --check .`, `pnpm exec eslint .`, `tsc --noEmit`
    const direct = /^(?:npx |pnpm exec |pnpm |yarn )?(prettier|eslint|tsc|stylelint)( .*)?$/.exec(
      line,
    );
    const name = direct?.[1];
    const rest = (direct?.[2] ?? '').trim();
    if (!name || /--write|--fix|\s-w\b/.test(rest) || /[;|`$<>]/.test(rest)) continue;
    const args = rest ? rest.split(' ') : [];
    add({
      name: `${name}${rest ? ` ${rest}` : ''}`,
      command: pm === 'npm' ? 'npx' : pm,
      args: pm === 'npm' ? [name, ...args] : ['exec', name, ...args],
      ...(name === 'prettier' || name === 'eslint' ? { tool: name } : {}),
    });
  }
  return out;
}

/** Files Prettier and ESLint format: the ones Fitts edits. */
export const FORMATTABLE = /\.(tsx?|jsx?|mjs|cjs|css|scss|html|json|md|vue|svelte|astro)$/;
export const LINTABLE = /\.(tsx?|jsx?|mjs|cjs|vue|svelte|astro)$/;
