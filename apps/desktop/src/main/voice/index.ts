// Voice in main (SPEC-phase2 §14): the Transcribe session the mic feeds, and the ElevenLabs
// stream Fitts speaks through. The renderer captures and plays audio; main holds the sockets
// and the keys. No audio is stored. Offline (e2e) and keyless runs answer `ok: false`, and the
// renderer falls back (canned transcripts, the OS voice), as in Phase 1.
import { IPC, type KeyName, type TalkSessionMode, type VoiceEvent } from '@fitts/schema';
import { ipcMain, type WebContents } from 'electron';
import { TranscribeSession } from './transcribe';
import { SpeechStream } from './tts';

/** Spoken input and output for the ledger (§11): stt seconds, tts characters. */
export type VoiceUsage = { task: 'stt'; seconds: number } | { task: 'tts'; chars: number };

const BYTES_PER_SECOND = 24_000 * 2;

export class VoiceHost {
  private session:
    { stt: TranscribeSession; wc: WebContents; bytes: number; projectId: string } | undefined;
  private speech: SpeechStream | undefined;
  private speechId = 0;

  constructor(
    private readonly key: (name: KeyName) => string | undefined,
    private readonly usage: (projectId: string, u: VoiceUsage) => void,
  ) {}

  private send(wc: WebContents, event: VoiceEvent): void {
    if (!wc.isDestroyed()) wc.send(IPC.voiceEvent, event);
  }

  /** Offline runs (e2e) get no voice, unless a test points Transcribe at a local server. */
  private get offline(): boolean {
    return process.env['FITTS_OFFLINE'] === '1' && !process.env['FITTS_TRANSCRIBE_URL'];
  }

  async start(
    wc: WebContents,
    mode: TalkSessionMode,
    projectId: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    this.cancel();
    const key = this.key('meta');
    if (this.offline || !key) return { ok: false, reason: this.offline ? 'offline' : 'no key' };
    const entry = { stt: undefined as unknown as TranscribeSession, wc, bytes: 0, projectId };
    entry.stt = new TranscribeSession(key, mode, {
      partial: (text) => this.send(wc, { kind: 'partial', text }),
      final: (text) => this.send(wc, { kind: 'final', text }),
      speech: () => this.send(wc, { kind: 'speech' }),
      error: (text) => this.send(wc, { kind: 'error', text }),
      closed: () => {
        if (this.session === entry) this.session = undefined;
        if (entry.bytes > 0)
          this.usage(projectId, { task: 'stt', seconds: entry.bytes / BYTES_PER_SECOND });
        this.send(wc, { kind: 'closed' });
      },
    });
    this.session = entry;
    try {
      await entry.stt.open();
      return { ok: true };
    } catch (e) {
      this.session = undefined;
      return { ok: false, reason: (e as Error).message };
    }
  }

  audio(pcm: ArrayBuffer): void {
    if (!this.session) return;
    this.session.bytes += pcm.byteLength;
    this.session.stt.push(pcm);
  }

  end(): void {
    this.session?.stt.end();
  }

  cancel(): void {
    this.session?.stt.close();
    this.session = undefined;
  }

  /** Streams one line with ElevenLabs; `ok: false` means use the OS voice. */
  speak(
    wc: WebContents,
    text: string,
    voiceId: string,
    projectId: string,
  ): { ok: boolean; id: number } {
    this.stopSpeaking();
    const key = this.key('elevenlabs');
    const id = ++this.speechId;
    if (this.offline || !key || !text.trim()) return { ok: false, id };
    const stream = new SpeechStream(key, voiceId, {
      audio: (pcm) => {
        if (this.speechId === id && !wc.isDestroyed()) wc.send(IPC.voiceAudio, id, pcm);
      },
      done: () => {
        if (this.speechId === id) this.send(wc, { kind: 'spoken', id });
      },
      error: (message) => {
        if (this.speechId === id) this.send(wc, { kind: 'speakError', id, text: message });
      },
    });
    this.speech = stream;
    stream.start(text);
    this.usage(projectId, { task: 'tts', chars: text.length });
    return { ok: true, id };
  }

  stopSpeaking(): void {
    this.speech?.cancel();
    this.speech = undefined;
    this.speechId += 1;
  }

  register(): void {
    ipcMain.handle(IPC.voiceStart, (e, mode: unknown, projectId: unknown) =>
      this.start(
        e.sender,
        mode === 'ENDPOINTING' ? 'ENDPOINTING' : 'PUSH_TO_TALK',
        typeof projectId === 'string' ? projectId : '',
      ),
    );
    ipcMain.on(IPC.voiceAudioIn, (_e, pcm: unknown) => {
      if (pcm instanceof ArrayBuffer) this.audio(pcm);
      else if (ArrayBuffer.isView(pcm))
        this.audio(
          pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer,
        );
    });
    ipcMain.on(IPC.voiceEnd, () => this.end());
    ipcMain.on(IPC.voiceCancel, () => this.cancel());
    ipcMain.handle(IPC.voiceSpeak, (e, text: unknown, voiceId: unknown, projectId: unknown) =>
      this.speak(
        e.sender,
        typeof text === 'string' ? text.slice(0, 2000) : '',
        typeof voiceId === 'string' ? voiceId : '',
        typeof projectId === 'string' ? projectId : '',
      ),
    );
    ipcMain.on(IPC.voiceStopSpeaking, () => this.stopSpeaking());
  }
}
