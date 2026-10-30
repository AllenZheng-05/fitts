// P11 live check: Fitts's ElevenLabs stream (apps/desktop/src/main/voice/tts.ts) speaks one line
// and returns 24 kHz s16le PCM. About $0.006. Uses ELEVENLABS_VOICE_ID when set, else the
// default voice.
import { SpeechStream } from '../../apps/desktop/src/main/voice/tts';
import { canSpend, key, log, recordSpend, saveResult } from './_lib';

const apiKey = key('ELEVENLABS_API_KEY');
if (!apiKey) process.exit(0);
const line = 'Found the first two from your list. The recipient shows as null.';
if (!canSpend(0.01)) process.exit(0);

const started = Date.now();
const result = await new Promise<Record<string, unknown>>((resolve) => {
  let bytes = 0;
  let chunks = 0;
  let firstMs: number | undefined;
  const stream = new SpeechStream(apiKey, process.env['ELEVENLABS_VOICE_ID']?.trim() ?? '', {
    audio: (pcm) => {
      firstMs ??= Date.now() - started;
      bytes += pcm.byteLength;
      chunks += 1;
    },
    done: () =>
      resolve({
        ok: bytes > 0,
        chunks,
        bytes,
        seconds: Number((bytes / 48_000).toFixed(2)),
        firstAudioMs: firstMs,
        totalMs: Date.now() - started,
      }),
    error: (message) => resolve({ ok: false, message }),
  });
  stream.start(line);
  setTimeout(() => {
    stream.cancel();
    resolve({ ok: false, message: 'timed out' });
  }, 30_000);
});
recordSpend('p11-tts', line.length * 0.00011, 'one ElevenLabs line');
log('tts', result);
saveResult('p11-tts', result);
