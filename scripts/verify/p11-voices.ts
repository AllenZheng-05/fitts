// Lists the ElevenLabs account's voices (name, id, category) to pick one the plan can stream.
import { key, log } from './_lib';

const apiKey = key('ELEVENLABS_API_KEY');
if (!apiKey) process.exit(0);
const res = await fetch('https://api.elevenlabs.io/v1/voices', {
  headers: { 'xi-api-key': apiKey },
});
const body = (await res.json()) as {
  voices?: { voice_id: string; name: string; category: string }[];
};
log(
  'voices',
  (body.voices ?? []).map((v) => `${v.category} · ${v.name} · ${v.voice_id}`),
);
