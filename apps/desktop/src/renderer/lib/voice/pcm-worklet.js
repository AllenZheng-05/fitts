// The mic's AudioWorklet (SPEC-phase2 §14): the AudioContext runs at 24 kHz (Chromium resamples
// the mic), so this only batches 100ms of samples and converts them to s16le mono PCM.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(2400);
    this.length = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        const s = Math.max(-1, Math.min(1, channel[i]));
        this.buffer[this.length++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.length === this.buffer.length) {
          this.port.postMessage(this.buffer.buffer, [this.buffer.buffer]);
          this.buffer = new Int16Array(2400);
          this.length = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('fitts-pcm-capture', PcmCapture);
