// Prints which keys are present in .env.local (booleans only, never values).
import { CAP_USD, key, log, readSpend } from './_lib';

log({
  meta: Boolean(key('META_API_KEY')),
  baseten: Boolean(key('BASETEN_API_KEY')),
  elevenlabs: Boolean(key('ELEVENLABS_API_KEY')),
  elevenlabsVoice: Boolean(process.env['ELEVENLABS_VOICE_ID']?.trim()),
  capUsd: CAP_USD,
  spentUsd: readSpend().totalUsd,
});
