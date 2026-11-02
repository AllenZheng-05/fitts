// @vitest-environment node
// Muse Code detection and the command line (SPEC-phase4 §7.4), with a fake runner: no process
// is started and no key is ever on a command line.
import { describe, expect, it } from 'vitest';
import { MUSE_SAFE_FLAGS, museCommand, museStatus } from '../../src/main/fix/muse';

type Res = { code: number; stdout: string; stderr: string };
const runner = (answers: Record<string, Res>) => (cmd: string, args: string[]) =>
  Promise.resolve(
    answers[`${cmd} ${args.join(' ')}`] ?? { code: 1, stdout: '', stderr: 'not found' },
  );

const WSL_VERSION = 'wsl -e bash -lc muse "$@" muse --version';
const WSL_HELP = 'wsl -e bash -lc muse "$@" muse exec --help';

describe('museStatus', () => {
  it('native first; ready when exec takes --api-key-stdin', async () => {
    const s = await museStatus(
      runner({
        'muse --version': { code: 0, stdout: 'muse 1.4.14', stderr: '' },
        'muse exec --help': {
          code: 0,
          stdout: '  --api-key-stdin  read the key from stdin',
          stderr: '',
        },
      }),
      'linux',
    );
    expect(s).toEqual({ status: 'ready', via: 'native', version: '1.4.14' });
  });

  it('on Windows, through WSL when it isn’t native (V6: 1.4.14 is WSL-only)', async () => {
    const s = await museStatus(
      runner({
        'wsl --status': { code: 0, stdout: 'Default Distribution: Ubuntu', stderr: '' },
        [WSL_VERSION]: { code: 0, stdout: '1.4.14', stderr: '' },
        [WSL_HELP]: { code: 0, stdout: '--api-key-stdin', stderr: '' },
      }),
      'win32',
    );
    expect(s).toEqual({ status: 'ready', via: 'wsl', version: '1.4.14' });
  });

  it('too old without --api-key-stdin; not installed; no WSL', async () => {
    expect(
      (
        await museStatus(
          runner({
            'muse --version': { code: 0, stdout: '1.2.0', stderr: '' },
            'muse exec --help': { code: 0, stdout: '--prompt-file', stderr: '' },
          }) as never,
          'linux',
        )
      ).status,
    ).toBe('too-old');
    expect((await museStatus(runner({}) as never, 'linux')).status).toBe('not-installed');
    expect(
      (
        await museStatus(
          runner({
            'wsl --status': {
              code: 1,
              stdout: 'Windows Subsystem for Linux is not installed',
              stderr: '',
            },
          }) as never,
          'win32',
        )
      ).status,
    ).toBe('no-wsl');
  });
});

describe('museCommand', () => {
  it('passes arguments as bash positional parameters inside WSL, never interpolated', () => {
    const c = museCommand('wsl', ['exec', '--prompt-file', '../task one.md'], 'C:\\work\\tree');
    expect(c).toEqual({
      cmd: 'wsl',
      args: [
        '--cd',
        'C:\\work\\tree',
        '-e',
        'bash',
        '-lc',
        'muse "$@"',
        'muse',
        'exec',
        '--prompt-file',
        '../task one.md',
      ],
    });
    expect(museCommand('native', ['--version'])).toEqual({ cmd: 'muse', args: ['--version'] });
  });

  it('every run carries the three safety flags', () => {
    expect(MUSE_SAFE_FLAGS).toEqual([
      '--disable-web-tools',
      '--disable-request-user-input',
      '--no-session-log',
    ]);
  });
});
