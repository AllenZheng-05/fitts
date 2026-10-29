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

## 2. Create the ElevenLabs "Fitts" voice (10 min) — P11

**Why:** `ELEVENLABS_VOICE_ID` is not set in `.env.local`. Without it, Fitts speaks with a
default ElevenLabs voice.

1. In ElevenLabs › Voices, create or pick the "Fitts" voice and copy its voice ID.
2. Add `ELEVENLABS_VOICE_ID=<id>` to `.env.local`, or paste it in Settings › Voice.

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

## 4. Live check of `gh pr create --attach` (V8) (5 min, needs a GitHub repo)

**Why:** it publishes to GitHub. The flag exists in gh 2.102.0. This is folded into the real-PR
checklist that P9 adds (`scripts/real-pr-check.md`).
