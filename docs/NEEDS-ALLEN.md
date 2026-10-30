# Needs Allen

These things need you: anything that publishes to GitHub, installs software, uses your mic,
speakers or eyes, or spends beyond the session cap. They're in priority order for the
demo deadline. Each says why, the exact steps, and roughly how long it takes.

Phase 2's build is complete through P12 and every milestone is committed on `main`, but
nothing has been pushed.

## 1. Push the repo and create the demo mirror repos (10 min) — unblocks everything below

**Why:** these steps publish to GitHub.

1. **Push this repo.** It has the Phase 2 commits P0–P12, plus the CI workflow in
   `.github/workflows/build.yml`.

   ```
   git push origin main
   ```

2. **Create and push the mirrors.** The export is built and checked locally: it installs
   frozen, builds and typechecks standalone, and now commits its lockfile.

   ```
   gh repo create AllenZheng-05/fitts-demo-chat --public
   gh repo create AllenZheng-05/fitts-demo-hartwell --public
   pnpm demo:mirror --push
   ```

3. **Clone demo/chat** outside the monorepo, for example `~/code/fitts-demo-chat`, and run
   `pnpm install` there. That's the project real runs open PRs against. Fixes only run on a
   project that is its own git repo.

## 2. Real PRs on GitHub, including `--attach` (15 min, after 1)

**Why:** it publishes to GitHub. P9 is verified end to end with dry-run PRs against a local
bare repo (`tests/bench/p9.bench.ts`: 8 verified PRs, rollback and retry, undo, revert).
Opening real PRs, View PR, and undo on GitHub need you. Follow `scripts/real-pr-check.md`.

## 3. Create the ElevenLabs "Fitts" voice, then the voice check (15 min)

**Why:** Fitts can't speak with ElevenLabs yet. The account has no voices of its own, and on
the free plan the API refuses library voices ("Free users cannot use library voices via the
API"). Until a voice exists, Fitts uses the system voice, as designed. Listening also needs
your mic.

1. In ElevenLabs › Voices, create the "Fitts" voice (a voice design or a clone) and copy its
   ID. `pnpm tsx scripts/verify/p11-voices.ts` lists the account's voices.
2. Add `ELEVENLABS_VOICE_ID=<id>` to `.env.local`, then run
   `pnpm tsx scripts/verify/p11-tts.ts`. It should print `ok: true`.
3. Paste the ID in Settings › Voice & appearance › ElevenLabs voice ID.
4. Follow `scripts/voice-check.md`: mic, speakers, barge-in, always listening, fallback.

## 4. Publish the beta release and install it fresh on Windows (20 min, after 1)

**Why:** it publishes a release and installs software. The unpacked build already works
locally: `pnpm --filter @fitts/desktop dist:dir`, then `tests/bench/packaged.bench.ts`
launches `Fitts.exe` and plays the replay.

```
git tag v0.9.0-beta && git push origin v0.9.0-beta
```

CI then builds Windows, macOS and Linux, and publishes them to Releases. Then:

1. Download `Fitts-Setup-0.9.0-beta.exe` from Releases and install it (SmartScreen: More info
   → Run anyway).
2. Open it, then **Watch a recorded run** (no keys).
3. Add your key and open the demo/chat clone.

Check that the macOS job's first-launch e2e passed (the hiddenInset title bar, traffic
lights and ⌘ labels are otherwise unverified).

## 5. A live site that verifies through GitHub Pages (10 min)

**Why:** it reads your GitHub account (`gh api`), which this session didn't do.

1. In Fitts, open Add a project › Live site, then Connect GitHub Pages. Your Pages sites
   should be listed. Pick one: it says Verified.
2. Open it. Main re-checks ownership, then the crawl runs audit-only.
3. Optional: try the DNS (`_fitts-verify.<domain>` TXT) and file
   (`/.well-known/fitts-verify.txt`) methods on a domain you control.

## 6. One macOS pass (30 min, needs a Mac)

**Why:** the macOS UI has only been checked by CI, if that. Install the dmg ("Open Anyway"),
then check the title bar, the ⌘ shortcuts, mic permission, and a demo run.

## 7. Log Muse Code in inside WSL (5 min) — optional

**Why:** fixes currently run on the in-process fixer fallback, which works: 8 of 9 verified in
the P9 bench. Muse Code is the spec's primary path, and this session must not pass keys to it.

```
wsl -e bash -lc "muse login"
pnpm verify:v6
```

Using Muse Code for real fix jobs, once logged in, is follow-up work: the fallback is what's
wired.

## 8. Housekeeping (2 min)

- **Temp folders:** delete the leftover benchmark folders (`fitts-p9-*`, `fitts-fix-*`) in
  `%TEMP%`. The session's permission rules blocked a wildcard delete there; the benches now
  clean up after themselves.
