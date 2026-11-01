// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_SUCH_VOICE, testKey } from '../../src/agent/llm/test-key';

/** A fetch that answers like ElevenLabs did (Nov 1), and records what it was asked. */
const answer = (status: number, detail: unknown) => {
  const asked: { url: string; method?: string }[] = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    asked.push({ url, ...(init?.method ? { method: init.method } : {}) });
    return Promise.resolve(new Response(JSON.stringify({ detail }), { status }));
  }) as typeof fetch;
  return { asked, fetchImpl };
};

let offline: string | undefined;
beforeEach(() => {
  offline = process.env['FITTS_OFFLINE'];
  delete process.env['FITTS_OFFLINE'];
});
afterEach(() => {
  if (offline !== undefined) process.env['FITTS_OFFLINE'] = offline;
});

describe('the ElevenLabs key check: free, and only Text to Speech', () => {
  it('asks text to speech for a voice that doesn’t exist; “voice not found” means it works', async () => {
    const a = answer(404, {
      status: 'voice_not_found',
      code: 'voice_not_found',
      type: 'not_found',
    });
    expect(await testKey('elevenlabs', 'sk_good', a.fetchImpl)).toEqual({
      ok: true,
      message: 'Works',
    });
    expect(a.asked).toEqual([
      { url: `https://api.elevenlabs.io/v1/text-to-speech/${NO_SUCH_VOICE}`, method: 'POST' },
    ]);
  });

  it('a wrong key is a wrong key', async () => {
    const a = answer(400, { status: 'invalid_api_key', type: 'authentication_error' });
    expect(await testKey('elevenlabs', 'sk_bad', a.fetchImpl)).toEqual({
      ok: false,
      message: "That key didn't work",
    });
  });

  it('a key without the Text to Speech permission says so', async () => {
    const a = answer(401, { status: 'missing_permissions', message: 'needs text_to_speech' });
    expect(await testKey('elevenlabs', 'sk_limited', a.fetchImpl)).toEqual({
      ok: false,
      message: 'This key needs the Text to Speech permission',
    });
  });
});
