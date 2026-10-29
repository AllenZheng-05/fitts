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

  // Meta: GET /v1/models. Baseten: GET /models (free; the spec's 1-token call also costs). ElevenLabs: GET /v1/user.
  const [url, headers]: [string, Record<string, string>] =
    name === 'meta'
      ? [`${META_BASE_URL}/models`, { Authorization: `Bearer ${key}` }]
      : name === 'baseten'
        ? [`${BASETEN_BASE_URL}/models`, { Authorization: `Bearer ${key}` }]
        : [`${ELEVENLABS_URL}/user`, { 'xi-api-key': key }];
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
