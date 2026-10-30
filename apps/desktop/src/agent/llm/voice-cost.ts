// Speech costs for the ledger (SPEC-phase2 §11): Transcribe by the hour, ElevenLabs by the
// character. Both bill the run of the project the user was talking to.
import type { CostEvent } from '@fitts/schema';
import { PHASE_OF } from '../ledger/ledger';
import { PRICE_TABLE, TRANSCRIBE_USD_PER_HOUR, TTS_USD_PER_CHAR } from './pricing';

export function voiceEntry(
  runId: string,
  projectId: string,
  usage: { task: 'stt'; seconds: number } | { task: 'tts'; chars: number },
): CostEvent {
  const base = {
    ts: new Date().toISOString(),
    runId,
    projectId,
    contributor: false,
    inputTokens: 0,
    cachedTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    latencyMs: 0,
    priceTable: PRICE_TABLE,
  };
  return usage.task === 'stt'
    ? {
        ...base,
        task: 'stt',
        phase: PHASE_OF.stt,
        provider: 'meta',
        model: 'muse-voice-transcribe-1.0',
        audioSeconds: usage.seconds,
        usd: (usage.seconds / 3600) * TRANSCRIBE_USD_PER_HOUR,
      }
    : {
        ...base,
        task: 'tts',
        phase: PHASE_OF.tts,
        provider: 'elevenlabs',
        model: 'eleven_flash_v2_5',
        ttsChars: usage.chars,
        usd: usage.chars * TTS_USD_PER_CHAR,
      };
}
