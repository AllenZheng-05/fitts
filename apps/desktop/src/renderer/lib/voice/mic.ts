// Mic capture for Transcribe (SPEC-phase2 §14): echo cancellation, noise suppression and
// automatic gain on; a 24 kHz AudioContext and a worklet that sends 100ms s16le frames. No
// audio is stored anywhere: frames go straight to main's Transcribe session.
// A file, never an inlined data: URL: the CSP only allows same-origin scripts.
import workletUrl from './pcm-worklet.js?url&no-inline';

export interface MicCapture {
  stop(): void;
}

export async function startMic(onFrame: (pcm: ArrayBuffer) => void): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext({ sampleRate: 24_000 });
  try {
    await ctx.audioWorklet.addModule(workletUrl);
  } catch (e) {
    for (const t of stream.getTracks()) t.stop();
    void ctx.close();
    throw e;
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'fitts-pcm-capture');
  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => onFrame(e.data);
  source.connect(node);
  return {
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      for (const t of stream.getTracks()) t.stop();
      void ctx.close();
    },
  };
}
