// V5 probe: which realtime URL and auth the Transcribe WebSocket accepts, and its first events.
import WebSocket from 'ws';
import { key, log, saveResult } from './_lib';

const apiKey = key('META_API_KEY');
if (!apiKey) process.exit(0);
const urls = [
  'wss://api.meta.ai/v1/realtime?intent=transcription',
  'wss://api.meta.ai/v1/realtime?model=muse-voice-transcribe-1.0',
  'wss://api.meta.ai/v1/realtime/transcription?model=muse-voice-transcribe-1.0',
  'wss://api.meta.ai/v1/audio/transcriptions/realtime?model=muse-voice-transcribe-1.0',
];
const results: Record<string, unknown> = {};

function probe(url: string): Promise<unknown> {
  return new Promise((resolve) => {
    const events: unknown[] = [];
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const done = (extra: Record<string, unknown>) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* closed */
      }
      resolve({ events, ...extra });
    };
    const timer = setTimeout(() => done({ timeout: true }), 6000);
    ws.on('unexpected-response', (_req, res) => {
      let body = '';
      res.on('data', (c: Buffer) => (body += c.toString()));
      res.on('end', () => done({ httpStatus: res.statusCode, body: body.slice(0, 400) }));
    });
    ws.on('open', () => events.push('open'));
    ws.on('message', (data) => {
      const text = (data as Buffer).toString();
      events.push(text.slice(0, 600));
      if (events.length >= 3) done({});
    });
    ws.on('error', (e) => done({ error: e.message }));
    ws.on('close', (code, reason) => done({ closed: code, reason: reason.toString() }));
  });
}

for (const url of urls) {
  results[url] = await probe(url);
  log(url, results[url]);
}
saveResult('v5-probe', results);
