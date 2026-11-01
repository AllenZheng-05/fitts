// How ElevenLabs answers a speech request for a voice that doesn't exist, with a real key and a
// fake one: the free key check (Settings) relies on the key being checked before the voice.
// Nothing is spoken, so nothing is charged. Only statuses and error codes are printed, never
// the key.
import { key, log } from './_lib';

const apiKey = key('ELEVENLABS_API_KEY');
if (!apiKey) process.exit(0);

async function ask(label: string, k: string): Promise<void> {
  const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/FittsKeyCheck0000000', {
    method: 'POST',
    headers: { 'xi-api-key': k, 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'a', model_id: 'eleven_flash_v2_5' }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    detail?: { status?: string; code?: string; type?: string } | string;
  };
  const d = body.detail;
  log(label, [
    `HTTP ${res.status}`,
    typeof d === 'string' ? d.slice(0, 80) : `${d?.status ?? ''} ${d?.code ?? ''} ${d?.type ?? ''}`,
  ]);
}

await ask('real key, no such voice', apiKey);
await ask('fake key, no such voice', 'sk_' + '0'.repeat(48));
