// Muse Voice Transcribe, realtime (SPEC-phase2 §14, V5). Main holds the WebSocket: the key goes
// in the first JSON frame, audio is raw s16le mono PCM, and `{"type":"endStream"}` finishes.
// Push to talk gets its final text right after endStream; endpointing splits turns itself.
// No audio is stored.
import type { TalkSessionMode } from '@fitts/schema';

export const TRANSCRIBE_URL = 'wss://api.meta.ai/v1/asr/realtime';
export const TRANSCRIBE_MODEL = 'muse-voice-transcribe-1.0';

export interface TranscribeEvents {
  /** The cumulative partial for the current turn. */
  partial(text: string): void;
  /** A finished turn (endpointing), or the session's final text (push to talk). */
  final(text: string): void;
  /** The user started speaking (barge-in: Fitts stops talking). */
  speech(): void;
  error(message: string): void;
  closed(): void;
}

interface ServerMessage {
  type?: string;
  sessionId?: string;
  transcript?: string;
  message?: string;
}

export class TranscribeSession {
  private ws: WebSocket | undefined;
  private queue: ArrayBuffer[] = [];
  private ready = false;
  private last = '';
  private ended = false;
  private finalSent = false;

  constructor(
    private readonly apiKey: string,
    private readonly mode: TalkSessionMode,
    private readonly on: TranscribeEvents,
    private readonly url = process.env['FITTS_TRANSCRIBE_URL'] ?? TRANSCRIBE_URL,
  ) {}

  /** Connects and sends the handshake; resolves once the server answers with a session. */
  open(timeoutMs = 10_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      const timer = setTimeout(() => {
        reject(new Error('Transcribe didn’t answer'));
        ws.close();
      }, timeoutMs);
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            mode: this.mode,
            authorization: { accessToken: this.apiKey },
            audioEncoding: 'PCM_24KHZ',
            model: TRANSCRIBE_MODEL,
            partialMode: 'CUMULATIVE',
            emitAudioProgress: false,
            keywords: ['Fitts'],
          }),
        );
      };
      ws.onmessage = (e: MessageEvent) => {
        if (typeof e.data !== 'string') return;
        let msg: ServerMessage;
        try {
          msg = JSON.parse(e.data) as ServerMessage;
        } catch {
          return;
        }
        if (!this.ready && msg.sessionId) {
          this.ready = true;
          clearTimeout(timer);
          for (const chunk of this.queue) ws.send(chunk);
          this.queue = [];
          resolve();
          return;
        }
        this.handle(msg);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        if (!this.ready) reject(new Error('Couldn’t reach Transcribe'));
        else this.on.error('The connection to Transcribe dropped');
      };
      ws.onclose = () => {
        clearTimeout(timer);
        // Push to talk: the last transcript is the answer if no speechComplete arrived.
        if (this.ended && !this.finalSent && this.last) this.emitFinal(this.last);
        this.on.closed();
      };
    });
  }

  private emitFinal(text: string): void {
    this.finalSent = true;
    this.on.final(text.trim());
  }

  private handle(msg: ServerMessage): void {
    switch (msg.type) {
      case 'speechStart':
        this.on.speech();
        return;
      case 'transcript':
        if (msg.transcript) {
          this.last = msg.transcript;
          this.on.partial(msg.transcript);
        }
        return;
      case 'speechComplete':
        if (msg.transcript) {
          this.last = '';
          if (this.mode === 'ENDPOINTING') this.on.final(msg.transcript.trim());
          else this.last = msg.transcript;
        }
        return;
      case 'error':
        this.on.error(msg.message ?? 'Transcribe error');
        return;
    }
  }

  /** One chunk of 24 kHz s16le mono PCM (about 100ms). */
  push(pcm: ArrayBuffer): void {
    if (this.ended) return;
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm);
    else this.queue.push(pcm);
  }

  /** Push to talk: no more audio; the server sends the final text and closes. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('{"type":"endStream"}');
  }

  close(): void {
    this.ended = true;
    this.finalSent = true;
    this.ws?.close();
  }
}
