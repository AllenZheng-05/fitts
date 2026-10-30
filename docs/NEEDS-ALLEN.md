# Needs Allen

Things that need you (GitHub publishing, system installs, your mic, speakers or eyes, or spend
beyond the session cap). Ordered by priority. Each item says why, the exact steps, and how long
it should take.

## 1. Log Muse Code in inside WSL (5 min) — unblocks real fixes (P9) and V6

**Why:** `muse` in WSL isn't logged in (there's no `~/.config/muse/`), and this session must not
pass API keys to it. Until it's logged in, fixes run on the in-process Wonder fallback instead
of Muse Code.

```
wsl -e bash -lc "muse login"
wsl -e bash -lc "muse --version && ls ~/.config/muse"
```

Then rerun the real-model V6 check (about $0.01):

```
pnpm verify:v6
```

## 2. Create the ElevenLabs "Fitts" voice, then the voice check (15 min) — P11

**Why:** Fitts can't speak with ElevenLabs yet. The account has no voices of its own, and on the
free plan the API refuses library voices ("Free users cannot use library voices via the API").
Until a voice exists, Fitts falls back to the system voice, as designed. Listening also needs
your mic.

1. In ElevenLabs › Voices, create the "Fitts" voice (a voice design or a clone) and copy its ID.
   `pnpm tsx scripts/verify/p11-voices.ts` lists the account's voices.
2. Add `ELEVENLABS_VOICE_ID=<id>` to `.env.local`, then run
   `pnpm tsx scripts/verify/p11-tts.ts`. It should print `ok: true`.
3. Paste the ID in Settings › Voice & appearance › ElevenLabs voice ID.
4. Follow `scripts/voice-check.md`: mic, speakers, barge-in, always listening, fallback.

## 3. Create and push the two demo mirror repos (5 min) — P0 acceptance, needed before P9

**Why:** it publishes to GitHub. The export is built and checked locally (it installs, builds
and typechecks standalone).

```
gh repo create AllenZheng-05/fitts-demo-chat --public
gh repo create AllenZheng-05/fitts-demo-hartwell --public
pnpm demo:mirror --push
```

Then clone each one somewhere outside the monorepo (for example `~/code/fitts-demo-chat`),
run `pnpm install` there, and add that folder in Fitts. That's the project real runs open PRs
against.

## 4. Real PRs on GitHub, including `--attach` (V8) (15 min, after item 3)

**Why:** it publishes to GitHub. P9 is verified end to end with dry-run PRs against a local bare
repo (`tests/bench/p9.bench.ts`). Opening real PRs, View PR, and undo against GitHub need you.
Follow `scripts/real-pr-check.md`.
