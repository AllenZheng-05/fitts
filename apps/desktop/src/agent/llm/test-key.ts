// Key validation (SPEC-phase2 §15): one cheap request to each provider. The responses are
// never logged; only "Works" or a short reason goes back to the UI.
import type { KeyName } from '@fitts/schema';

export const META_BASE_URL = 'https://api.meta.ai/v1';
export const BASETEN_BASE_URL = 'https://inference.baseten.co/v1';
const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1';

/**
 * Offline runs (e2e tests, FITTS_OFFLINE=1) keep Phase 1's rule: 8+ characters works. Tests
 * must never call the network.
 */
const offline = () => process.env['FITTS_OFFLINE'] === '1';

export async function testKey(
  name: KeyName,
  value: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; message: string }> {
  const key = value.trim();
  if (!key) return { ok: false, message: 'No key' };
  if (offline())
    return key.length >= 8
      ? { ok: true, message: 'Works' }
      : { ok: false, message: "That key didn't work" };

  if (name === 'elevenlabs') return testElevenLabs(key, fetchImpl);
  // Meta: GET /v1/models. Baseten: GET /models (free; the spec's 1-token call also costs).
  const [url, headers]: [string, Record<string, string>] =
    name === 'meta'
      ? [`${META_BASE_URL}/models`, { Authorization: `Bearer ${key}` }]
      : [`${BASETEN_BASE_URL}/models`, { Authorization: `Bearer ${key}` }];
  try {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (res.ok) return { ok: true, message: 'Works' };
    if (res.status === 401 || res.status === 403)
      return { ok: false, message: "That key didn't work" };
    return { ok: false, message: `The provider answered ${res.status}` };
  } catch {
    return { ok: false, message: "Couldn't reach the provider" };
  }
}

/** A voice id in the right shape that no account has: asking it to speak costs nothing. */
export const NO_SUCH_VOICE = 'FittsKeyCheck0000000';

/**
 * ElevenLabs: ask the one endpoint Fitts uses, text to speech, for a voice that doesn't exist.
 * ElevenLabs checks the key and its Text to Speech permission first, so "voice not found" means
 * the key can speak; nothing is generated, so nothing is charged. A key needs only that one
 * permission (checked on Nov 1 with scripts/verify/elevenlabs-key-check.ts).
 */
async function testElevenLabs(
  key: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetchImpl(`${ELEVENLABS_URL}/text-to-speech/${NO_SUCH_VOICE}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'a', model_id: 'eleven_flash_v2_5' }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      detail?: { status?: string; code?: string; type?: string } | string;
    };
    const d = typeof body.detail === 'object' ? body.detail : {};
    const said = `${d.status ?? ''} ${d.code ?? ''} ${typeof body.detail === 'string' ? body.detail : ''}`;
    if (res.status === 404 && /voice_not_found/.test(said)) return { ok: true, message: 'Works' };
    if (/permission/i.test(said))
      return { ok: false, message: 'This key needs the Text to Speech permission' };
    if (d.type === 'authentication_error' || /api_key/.test(said) || res.status === 401)
      return { ok: false, message: "That key didn't work" };
    return { ok: false, message: `The provider answered ${res.status}` };
  } catch {
    return { ok: false, message: "Couldn't reach the provider" };
  }
}
