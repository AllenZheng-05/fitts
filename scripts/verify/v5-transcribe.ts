// V5: Muse Voice Transcribe realtime WebSocket (protocol per the LiveKit plugin source):
// JSON handshake frame with the token, raw binary PCM frames, {"type":"endStream"} to finish.
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canSpend, key, log, recordSpend, ROOT, saveResult } from './_lib';

const apiKey = key('META_API_KEY');
if (!apiKey) process.exit(0);
const URL = 'wss://api.meta.ai/v1/asr/realtime';

/** PCM samples from a WAV file's data chunk. */
function pcm(file: string): Buffer {
  const wav = readFileSync(file);
  let i = 12;
  while (i < wav.length) {
    const id = wav.toString('ascii', i, i + 4);
    const size = wav.readUInt32LE(i + 4);
    if (id === 'data') return wav.subarray(i + 8, i + 8 + size);
    i += 8 + size;
  }
  throw new Error('no data chunk');
}

function run(encoding: string, rate: number, mode: string, keywords?: string[]): Promise<unknown> {
  const audio = pcm(join(ROOT, '.fitts-dev', 'verify', `speech-${rate}.wav`));
  const seconds = audio.length / 2 / rate;
  return new Promise((resolve) => {
    const events: { t: number; type: string; text?: string }[] = [];
    const started = Date.now();
    let sessionId: string | undefined;
    const ws = new WebSocket(URL);
    const finish = (extra: Record<string, unknown>) => {
      clearTimeout(timer);
      resolve({ encoding, mode, audioSeconds: seconds, sessionId, events, ...extra });
      try {
        ws.close();
      } catch {
        /* closed */
      }
    };
    const timer = setTimeout(() => finish({ timeout: true }), 30_000);
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          mode,
          authorization: { accessToken: apiKey },
          audioEncoding: encoding,
          model: 'muse-voice-transcribe-1.0',
          partialMode: 'CUMULATIVE',
          emitAudioProgress: true,
          ...(keywords ? { keywords } : {}),
        }),
      );
    });
    ws.on('message', (data, isBinary) => void onMessage(data as Buffer, isBinary));
    const onMessage = async (data: Buffer, isBinary: boolean) => {
      if (isBinary) return;
      const msg = JSON.parse(data.toString()) as {
        type?: string;
        sessionId?: string;
        transcript?: string;
        message?: string;
      };
      const t = Date.now() - started;
      if (!sessionId && msg.sessionId) {
        sessionId = msg.sessionId;
        events.push({ t, type: `handshake:${msg.type ?? ''}` });
        // Stream in 100ms chunks at real time, then end the stream.
        const chunk = (rate / 10) * 2;
        for (let o = 0; o < audio.length; o += chunk) {
          ws.send(audio.subarray(o, o + chunk));
          await new Promise((r) => setTimeout(r, 100));
        }
        events.push({ t: Date.now() - started, type: 'sent:endStream' });
        ws.send('{"type":"endStream"}');
        return;
      }
      if (msg.type === 'audioProgress') return;
      events.push({ t, type: msg.type ?? '?', text: msg.transcript ?? msg.message });
      if (msg.type === 'error') finish({ error: msg });
    };
    ws.on('error', (e) => finish({ error: e.message }));
    ws.on('close', (code, reason) => finish({ closed: code, reason: reason.toString() }));
  });
}

const results: Record<string, unknown> = {};
if (canSpend(0.01)) {
  if (!process.argv.includes('--keywords-only')) {
    results['24k'] = await run('PCM_24KHZ', 24000, 'ENDPOINTING');
    log('24k', results['24k']);
    results['16k'] = await run('PCM_16KHZ', 16000, 'ENDPOINTING');
    log('16k', results['16k']);
    results['ptt'] = await run('PCM_24KHZ', 24000, 'PUSH_TO_TALK');
    log('ptt', results['ptt']);
  }
  results['ptt-keywords'] = await run('PCM_24KHZ', 24000, 'PUSH_TO_TALK', ['Fitts']);
  log('ptt-keywords', results['ptt-keywords']);
  recordSpend('v5', ((4 * 4) / 3600) * 0.18, 'four ~4s transcriptions');
}
saveResult(process.argv.includes('--keywords-only') ? 'v5-keywords' : 'v5-transcribe', results);
