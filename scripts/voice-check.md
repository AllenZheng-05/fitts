# Voice check (P11)

These are the parts of voice that need your microphone, speakers and ears. The tests already
cover the rest without a network or a real mic:

- `tests/e2e/voice.spec.ts`: Chromium's fake mic → worklet → main → a local Transcribe server
  → a spoken answer.
- `tests/main/voice.test.ts`: the V5 protocol.
- `tests/unit/voice-command.test.ts`: the "Fitts, …" rules.

Allow about 10 minutes; spend is a few cents.

## Before you start

- **Voice ID:** create (or add) a voice in ElevenLabs › Voices, and copy its voice ID. On the
  free plan, the API refuses library voices, and the account has none of its own yet
  (`pnpm tsx scripts/verify/p11-voices.ts` lists them). Then check that a line streams:
  `pnpm tsx scripts/verify/p11-tts.ts` should print `ok: true` with a few seconds of audio.
- `pnpm dev`, then open demo/chat.
- **Settings › Voice & appearance:** turn on "Fitts speaks aloud", choose "Fitts
  (ElevenLabs)" and paste the voice ID.

## Check

- [ ] **Tap to talk.** Tap the mic. You hear the start chime, "Mic on" shows, and words appear
      in the message box as you speak. Tap again: your words are sent with the SPOKEN tag.
      During the interview, they fill the brief.
- [ ] **"Fitts" is spelled right.** Say "Fitts, …": it comes out as "Fitts", not "Fitz".
- [ ] **Fitts speaks with your voice.** It reads new messages in full and the first line of
      cards. The line being spoken gets the cobalt bar, and the avatar pulses.
- [ ] **Cut-off.** A new line cuts the current one off cleanly, with no overlap.
- [ ] **Stops at once.** Switching projects, or turning "Fitts speaks aloud" off, stops it at
      once.
- [ ] **Barge-in.** While Fitts is talking, tap the mic and start speaking. Fitts fades out
      within about a tenth of a second.
- [ ] **Always listening** (Settings › How you talk to Fitts):
  - "Fitts, stop" stops the current action.
  - "Fitts, check the search page next" arrives as a spoken message.
  - A bare "stop" or "wait" does nothing.
  - "Mic on" stays visible while it listens.
- [ ] **Fallback.** Clear the ElevenLabs key in Settings. Fitts keeps talking with the system
      voice.
- [ ] **No audio is saved.** Nothing new appears under
      `%APPDATA%\Fitts\projects\<id>\runs\<run>\` except events.ndjson, shots and assets.

Report anything odd in docs/PROGRESS.md under Known issues.
