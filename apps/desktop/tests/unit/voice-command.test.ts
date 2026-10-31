// The "Fitts, …" rules for Always listening (SPEC-phase2 §14).
import { describe, expect, it } from 'vitest';
import { parseVoiceCommand } from '../../src/renderer/lib/voice-command';

describe('spoken commands (“Fitts” first)', () => {
  it('“Fitts, stop” stops; any other “Fitts, …” is an interrupt with that text', () => {
    expect(parseVoiceCommand('Fitts, stop')).toEqual({ kind: 'stop' });
    expect(parseVoiceCommand('fitts stop.')).toEqual({ kind: 'stop' });
    expect(parseVoiceCommand('Fitz, stop')).toEqual({ kind: 'stop' });
    expect(parseVoiceCommand('Fitts, check the search page next.')).toEqual({
      kind: 'say',
      text: 'Check the search page next.',
    });
    expect(parseVoiceCommand('Hey Fits, try the settings page')).toEqual({
      kind: 'say',
      text: 'Try the settings page',
    });
  });

  it('bare “stop” or “wait”, and talk that doesn’t start with Fitts, do nothing', () => {
    expect(parseVoiceCommand('stop')).toBeNull();
    expect(parseVoiceCommand('wait')).toBeNull();
    expect(parseVoiceCommand('I told Fitts to stop')).toBeNull();
    expect(parseVoiceCommand('Fittsburgh is nice')).toBeNull();
  });

  it('“Fitts” on its own wakes Fitts, and the next thing said is for it', () => {
    expect(parseVoiceCommand('Fitts')).toEqual({ kind: 'wake' });
    expect(parseVoiceCommand('Hey Fitts.')).toEqual({ kind: 'wake' });
    expect(parseVoiceCommand('check the search page', { armed: true })).toEqual({
      kind: 'say',
      text: 'Check the search page',
    });
    expect(parseVoiceCommand('stop', { armed: true })).toEqual({ kind: 'stop' });
    expect(parseVoiceCommand('check the search page')).toBeNull();
  });
});
