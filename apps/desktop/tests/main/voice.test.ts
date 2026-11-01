// @vitest-environment node
// Voice (§14) without a network: the Transcribe protocol against a local WebSocket server
// that speaks V5's events.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket as ServerSocket } from 'ws';
import { TranscribeSession, type TranscribeEvents } from '../../src/main/voice/transcribe';

let server: WebSocketServer;
let url = '';
const received: { handshake?: Record<string, unknown>; audioBytes: number; ended: boolean } = {
  audioBytes: 0,
  ended: false,
};

beforeAll(async () => {
  server = new WebSocketServer({ port: 0 });
  await new Promise<void>((r) => server.once('listening', () => r()));
  const address = server.address();
  url = `ws://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  server.on('connection', (ws: ServerSocket) => {
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        received.audioBytes += (data as Buffer).length;
        if (received.audioBytes >= 9600)
          ws.send(JSON.stringify({ type: 'transcript', transcript: 'Fitts, check' }));
        return;
      }
      const msg = JSON.parse((data as Buffer).toString('utf8')) as Record<string, unknown>;
      if (!received.handshake) {
        received.handshake = msg;
        ws.send(JSON.stringify({ type: 'sessionStarted', sessionId: 'abc' }));
        ws.send(JSON.stringify({ type: 'speechStart' }));
        return;
      }
      if (msg['type'] === 'endStream') {
        received.ended = true;
        ws.send(
          JSON.stringify({
            type: 'speechComplete',
            transcript: 'Fitts, check the search page next.',
          }),
        );
        ws.close(1000, 'No more transcript segments');
      }
    });
  });
});

afterAll(() => {
  server.close();
});

describe('Transcribe (V5 protocol)', () => {
  it('handshake with the key and the Fitts keyword, PCM frames, endStream, then the final text', async () => {
    const seen: string[] = [];
    let final = '';
    let closed = false;
    const events: TranscribeEvents = {
      partial: (t) => seen.push(`partial:${t}`),
      final: (t) => (final = t),
      speech: () => seen.push('speech'),
      error: (m) => seen.push(`error:${m}`),
      closed: () => (closed = true),
    };
    const session = new TranscribeSession('test-key', 'PUSH_TO_TALK', events, url);
    // Audio pushed before the session is ready is queued, not lost.
    session.push(new ArrayBuffer(4800));
    await session.open();
    session.push(new ArrayBuffer(4800));
    await new Promise((r) => setTimeout(r, 50));
    session.end();
    await new Promise((r) => setTimeout(r, 100));
    expect(received.handshake).toMatchObject({
      mode: 'PUSH_TO_TALK',
      authorization: { accessToken: 'test-key' },
      audioEncoding: 'PCM_24KHZ',
      model: 'muse-voice-transcribe-1.0',
      keywords: ['Fitts'],
    });
    expect(received.audioBytes).toBe(9600);
    expect(received.ended).toBe(true);
    expect(seen).toEqual(['speech', 'partial:Fitts, check']);
    expect(final).toBe('Fitts, check the search page next.');
    expect(closed).toBe(true);
  });
});

describe('voice sessions (one at a time, by id)', () => {
  it('a newer session replaces the old one; a late cancel for the old one leaves it alone', async () => {
    const { VoiceHost } = await import('../../src/main/voice/index');
    // Its own server: every connection gets a session, and endStream gets the final text.
    const own = new WebSocketServer({ port: 0 });
    await new Promise<void>((r) => own.once('listening', () => r()));
    own.on('connection', (ws: ServerSocket) => {
      let open = false;
      ws.on('message', (data, isBinary) => {
        if (isBinary) return;
        const msg = JSON.parse((data as Buffer).toString('utf8')) as Record<string, unknown>;
        if (!open) {
          open = true;
          ws.send(JSON.stringify({ type: 'sessionStarted', sessionId: 's' }));
        } else if (msg['type'] === 'endStream') {
          ws.send(JSON.stringify({ type: 'transcript', transcript: 'Hello' }));
          ws.close(1000, 'No more transcript segments');
        }
      });
    });
    const address = own.address();
    process.env['FITTS_TRANSCRIBE_URL'] =
      `ws://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    const events: { kind: string; session?: number }[] = [];
    const wc = {
      isDestroyed: () => false,
      send: (_channel: string, e: { kind: string; session?: number }) => events.push(e),
    } as never;
    try {
      const host = new VoiceHost(
        () => 'test-key',
        () => undefined,
      );
      const wake = await host.start(wc, 'ENDPOINTING', 'p');
      const mic = await host.start(wc, 'PUSH_TO_TALK', 'p');
      expect(wake.ok && mic.ok).toBe(true);
      expect(mic.session).not.toBe(wake.session);
      // "Always listening" cleans up after the mic button took over: nothing happens to it.
      host.cancel(wake.session ?? -1);
      host.audio(mic.session ?? -1, new ArrayBuffer(4800));
      host.end(mic.session ?? -1);
      // The final text arrives when it arrives (a cold CI runner is slow), not after a guess.
      await vi.waitFor(
        () =>
          expect(events).toContainEqual(
            expect.objectContaining({ kind: 'final', session: mic.session }),
          ),
        { timeout: 10_000, interval: 50 },
      );
      const closed = events.filter((e) => e.kind === 'closed').map((e) => e.session);
      expect(closed).toContain(wake.session);
      expect(events).toContainEqual(
        expect.objectContaining({ kind: 'final', session: mic.session }),
      );
    } finally {
      delete process.env['FITTS_TRANSCRIBE_URL'];
      own.close();
    }
  }, 30_000);
});
