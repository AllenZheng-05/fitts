// @vitest-environment node
// Which CI checks Fitts runs before a PR: the ones a project's workflows run, only the ones that
// check code, and never installs, builds or fixes.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ciChecks, workflowCommands } from '../../src/main/fix/ci';

let dir = '';
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function project(workflow: string, scripts: Record<string, string>) {
  dir = mkdtempSync(join(tmpdir(), 'fitts-ci-'));
  mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(dir, '.github', 'workflows', 'ci.yml'), workflow);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts }));
  return dir;
}

const WORKFLOW = `name: CI
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - name: Format
        run: |
          pnpm format:check
          npx tsc --noEmit
      - run: pnpm build && pnpm deploy
      - run: npx prettier --write .
`;

describe('CI checks', () => {
  it('reads every run line, blocks and && included', () => {
    const cmds = workflowCommands(project(WORKFLOW, {}));
    expect(cmds).toEqual([
      'pnpm install --frozen-lockfile',
      'pnpm lint',
      'pnpm format:check',
      'npx tsc --noEmit',
      'pnpm build',
      'pnpm deploy',
      'npx prettier --write .',
    ]);
  });

  it('keeps the checks (lint, format, types) and drops installs, builds, deploys and fixes', () => {
    const checks = ciChecks(
      project(WORKFLOW, {
        lint: 'eslint .',
        'format:check': 'prettier --check .',
        build: 'vite build',
        deploy: 'gh-pages -d dist',
      }),
      'pnpm',
    );
    expect(checks.map((c) => c.name)).toEqual(['pnpm lint', 'pnpm format:check', 'tsc --noEmit']);
    expect(checks.map((c) => c.tool)).toEqual(['eslint', 'prettier', undefined]);
    expect(checks[2]).toMatchObject({ command: 'pnpm', args: ['exec', 'tsc', '--noEmit'] });
  });

  it('finds nothing to run without workflows', () => {
    dir = mkdtempSync(join(tmpdir(), 'fitts-ci-'));
    expect(ciChecks(dir, 'npm')).toEqual([]);
  });
});
