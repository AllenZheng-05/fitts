// Fitts's voice: ElevenLabs Flash v2.5 over its stream-input WebSocket (SPEC-phase2 §14). Main
// holds the stream and hands 24 kHz s16le PCM chunks to the renderer, which plays them through
// Web Audio. Cancelling closes the stream. Without a key, or on any error, the renderer falls
// back to the OS voice (speechSynthesis), as in Phase 1.

export const TTS_MODEL = 'eleven_flash_v2_5';
/** ElevenLabs' default voice, until Allen sets the "Fitts" voice ID (NEEDS-ALLEN 2). */
export const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

export interface TtsEvents {
  audio(pcm: ArrayBuffer): void;
  done(): void;
  error(message: string): void;
}

export function ttsUrl(voiceId: string): string {
  const base = process.env['FITTS_TTS_URL'] ?? 'wss://api.elevenlabs.io';
  return `${base}/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream-input?model_id=${TTS_MODEL}&output_format=pcm_24000`;
}

export class SpeechStream {
  private ws: WebSocket | undefined;
  private finished = false;

  constructor(
    private readonly apiKey: string,
    private readonly voiceId: string,
    private readonly on: TtsEvents,
  ) {}

  /** Streams one line: the opening frame (key and settings), the text, then the flush. */
  start(text: string): void {
    const ws = new WebSocket(ttsUrl(this.voiceId || DEFAULT_VOICE_ID));
    this.ws = ws;
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          text: ' ',
          voice_settings: { stability: 0.5, similarity_boost: 0.8, speed: 1.02 },
          xi_api_key: this.apiKey,
        }),
      );
      ws.send(JSON.stringify({ text: `${text} `, try_trigger_generation: true }));
      ws.send(JSON.stringify({ text: '' }));
    };
    ws.onmessage = (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      let msg: { audio?: string | null; isFinal?: boolean; error?: string; message?: string };
      try {
        msg = JSON.parse(e.data) as typeof msg;
      } catch {
        return;
      }
      if (msg.error) return this.fail(msg.message ?? msg.error);
      if (msg.audio) {
        const bytes = Buffer.from(msg.audio, 'base64');
        this.on.audio(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      }
      if (msg.isFinal) this.end();
    };
    ws.onerror = () => this.fail('Couldn’t reach ElevenLabs');
    ws.onclose = () => this.end();
  }

  private end(): void {
    if (this.finished) return;
    this.finished = true;
    this.on.done();
    this.ws?.close();
  }

  private fail(message: string): void {
    if (this.finished) return;
    this.finished = true;
    this.on.error(message);
    this.ws?.close();
  }

  cancel(): void {
    this.finished = true;
    this.ws?.close();
  }
}
