// @vitest-environment node
// Muse Code detection and the command line (SPEC-phase4 §7.4), with a fake runner: no process
// is started and no key is ever on a command line.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MUSE_SAFE_FLAGS, museCommand, museStatus, readMuseEvent } from '../../src/main/fix/muse';

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

describe('readMuseEvent', () => {
  const tally = () => ({
    usage: { input: 0, output: 0, cached: 0, reasoning: 0 },
    summary: '',
    final: '',
  });
  const usageEvent = (input: number, output: number) => ({
    payload_type: 'run.usage',
    payload: {
      models: [
        { input_tokens: input, output_tokens: output, cached_tokens: 10, reasoning_tokens: 5 },
        { input_tokens: 1, output_tokens: 1, cached_tokens: 0, reasoning_tokens: 0 },
      ],
    },
  });

  it('reads the final answer from a real run’s events (the echo provider)', () => {
    const t = tally();
    const lines = readFileSync(resolve(__dirname, '../fixtures/muse/echo.jsonl'), 'utf8');
    for (const l of lines.split('\n').filter(Boolean))
      readMuseEvent(t, JSON.parse(l) as Record<string, unknown>);
    expect(t.final).toBe('echo: say hi');
    expect(t.summary).toBe('echo: say hi');
    expect(t.usage).toEqual({ input: 0, output: 0, cached: 0, reasoning: 0 });
  });

  it('usage is the latest totals, summed over models, not added up event by event', () => {
    const t = tally();
    readMuseEvent(t, usageEvent(100, 20));
    readMuseEvent(t, usageEvent(300, 50));
    expect(t.usage).toEqual({ input: 301, output: 51, cached: 10, reasoning: 5 });
  });

  it('ignores events without the envelope', () => {
    const t = tally();
    readMuseEvent(t, { type: 'run.usage', usage: { input_tokens: 9 } });
    expect(t.usage.input).toBe(0);
  });
});

describe('the ledger’s label for Muse Code', () => {
  it('takes the model Muse Code reports in run.usage', () => {
    const t = { usage: { input: 0, output: 0, cached: 0, reasoning: 0 }, summary: '', final: '' };
    readMuseEvent(t, {
      payload_type: 'run.usage',
      payload: { models: [{ model: 'muse-wonder-1.0', input_tokens: 10, output_tokens: 2 }] },
    });
    expect(t).toMatchObject({ model: 'muse-wonder-1.0', usage: { input: 10, output: 2 } });
  });

  it('leaves it unset when Muse Code names none (the echo provider)', () => {
    const t: { model?: string } & Parameters<typeof readMuseEvent>[0] = {
      usage: { input: 0, output: 0, cached: 0, reasoning: 0 },
      summary: '',
      final: '',
    };
    readMuseEvent(t, { payload_type: 'run.usage', payload: { models: [{ model: null }] } });
    expect(t.model).toBeUndefined();
  });
});
