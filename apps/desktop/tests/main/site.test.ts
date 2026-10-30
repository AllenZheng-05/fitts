// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ net: {}, protocol: {}, ipcMain: { on: vi.fn(), handle: vi.fn() } }));
const { assetPath } = await import('../../src/main/asset-protocol');
const { detectDevCommand, detectFramework, detectProject, githubRepo } =
  await import('../../src/main/projects/detect');
const { splitCommand, spawnProcess } = await import('../../src/main/spawn');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fitts-site-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('project detection', () => {
  it('names the framework and its default port from package.json', () => {
    expect(
      detectFramework({ devDependencies: { vite: '8.3.5' }, dependencies: { react: '19.3.1' } }),
    ).toEqual({
      framework: 'Vite + React 19',
      port: 5173,
    });
    expect(detectFramework({ dependencies: { next: '^15.1.0' } })).toEqual({
      framework: 'Next.js 15',
      port: 3000,
    });
    expect(detectFramework({ dependencies: { astro: '5.0.0' } }).port).toBe(4321);
  });

  it('picks the package manager from the lockfile and reads --port from the script', () => {
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    expect(detectDevCommand(dir, { scripts: { dev: 'vite --port 4100' } })).toEqual({
      command: 'pnpm dev',
      port: 4100,
    });
    rmSync(join(dir, 'pnpm-lock.yaml'));
    expect(detectDevCommand(dir, { scripts: { start: 'react-scripts start' } })).toEqual({
      command: 'npm run start',
    });
  });

  it('reads the GitHub repo from https and ssh remotes', () => {
    expect(githubRepo('https://github.com/AllenZheng-05/fitts-demo-chat.git')).toBe(
      'AllenZheng-05/fitts-demo-chat',
    );
    expect(githubRepo('git@github.com:hartwell/site.git\n')).toBe('hartwell/site');
    expect(githubRepo('https://gitlab.com/x/y.git')).toBeUndefined();
  });

  it('detects the real demo/chat, with its start path and the source plugin', async () => {
    const d = await detectProject(resolve(__dirname, '../../../../demo/chat'));
    expect(d).toMatchObject({
      id: 'demo-chat',
      framework: 'Vite + React 19',
      devCommand: 'pnpm dev',
      port: 5173,
      startPath: '/compose',
      hasPlugin: true,
    });
  });

  it('returns null for a folder that does not exist', async () => {
    expect(await detectProject(join(dir, 'nope'))).toBeNull();
  });
});

describe('spawner', () => {
  it('splits a dev command into a command and arguments', () => {
    expect(splitCommand('npm run  dev')).toEqual(['npm', ['run', 'dev']]);
  });

  it.runIf(process.platform === 'win32')('refuses shell metacharacters on the cmd.exe path', () => {
    expect(() => spawnProcess('pnpm', ['dev', '&&', 'calc'], { cwd: dir })).toThrow(/unsafe/);
    expect(() => spawnProcess('npm', ['run', 'dev"x'], { cwd: dir })).toThrow(/unsafe/);
  });
});

describe('fitts-asset paths', () => {
  const root = resolve('/data');
  it('maps shots and assets inside the run folder', () => {
    expect(assetPath(root, 'fitts-asset://demo-chat/run-7/shots/19.jpg')).toBe(
      join(root, 'projects', 'demo-chat', 'runs', 'run-7', 'shots', '19.jpg'),
    );
  });
  it('refuses traversal, other folders and other file types', () => {
    expect(assetPath(root, 'fitts-asset://demo-chat/run-7/shots/../../../secrets.json')).toBeNull();
    expect(assetPath(root, 'fitts-asset://demo-chat/run-7/events/19.jpg')).toBeNull();
    expect(assetPath(root, 'fitts-asset://demo-chat/run-7/shots/x.ndjson')).toBeNull();
    expect(assetPath(root, 'fitts-asset://../run-7/shots/1.jpg')).toBeNull();
  });
});
