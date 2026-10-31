# Needs Allen

These things need you: anything that publishes to GitHub, installs software, uses your mic,
speakers or eyes, or spends beyond the session cap. They're in priority order for the
demo deadline. Each says why, the exact steps, and roughly how long it takes.

You pushed `main` once; everything since (CI fixes, the redesign, release builds without
stand-ins, device sizes, the test gate, the website) is committed locally and not pushed.

## 1. Push Fitts (2 min) — unblocks CI, the release and the site

```
git push origin main
```

CI runs typecheck, lint and unit tests on all three platforms; the CI failures you saw are
fixed (`2385cdb`).

## 2. The portfolio demo (15 min)

**Why:** it publishes your site. Everything is on local branches in
`C:\Users\Plasm\Projects\AllenZheng`; `main` is untouched, and `PLAN.md` was left alone.

- `fitts-demo-2007`: your homepage as a 2007 site, on purpose (the "before"). Your previous
  design is commit `aeab71f`.
- `fitts/redesign-launch-studio`: the newest verified redesign, from the design library: your
  vision ("playful and modern, like a 3D product launch, name front and center", admiring
  linear.app and rauno.me) as wide Unbounded type, self-hosted fonts and a lit three.js hero.
  Real autonomous run on a copy (dry-run PR), $0.83.
- `fitts/redesign-quiet-confidence`: the earlier verified redesign (before the library): it
  fixed all 9 findings, and your 28 tests pass on it.

For the demo:
1. Deploy the "before": merge `fitts-demo-2007` into `main` and push (Cloudflare deploys it).
2. Record Fitts on your real repo: open `C:\Users\Plasm\Projects\AllenZheng` in Fitts, in
   Autonomous mode, with `gh auth login` done, so it opens real PRs on
   `AllenZheng-05/AllenZheng`. In the interview, say you want a new look and describe it (a
   feeling, what to keep, a site or two you admire). Expect about $1 and 5–10 minutes.
3. Merge the redesign PR to deploy the "after" (or keep `fitts/redesign-launch-studio` as a
   fallback). To get your old design back afterwards: `git revert` the merge, or restore
   `src/themes/default` from `aeab71f`.

## 3. Publish fitts.allenzheng.com (15 min)

**Why:** it publishes, in your Cloudflare account. The site is `apps/site` (static).
1. Cloudflare › Workers & Pages › Create › Pages › connect `AllenZheng-05/fitts`.
2. Build command `pnpm install --frozen-lockfile && pnpm --filter @fitts/site build`; output
   directory `apps/site/dist`; environment variable `NODE_VERSION=22.13.1`.
3. Custom domains › add `fitts.allenzheng.com` (Cloudflare adds the CNAME, since
   allenzheng.com is already on Cloudflare).
4. When the demo video is up, put its embed URL in `links.video` in `apps/site/src/content.ts`.

The download buttons point at `releases/latest/download/Fitts-Setup.exe` (and
`Fitts-arm64.dmg`, `Fitts-x64.dmg`, `Fitts.AppImage`), so they work once a release exists (5).
## Later: the demo mirror repos (optional)

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

## Later: the real-PR checklist (the portfolio run in 2 covers it)

**Why:** it publishes to GitHub. P9 is verified end to end with dry-run PRs against a local
bare repo (`tests/bench/p9.bench.ts`: 8 verified PRs, rollback and retry, undo, revert).
Opening real PRs, View PR, and undo on GitHub need you. Follow `scripts/real-pr-check.md`.

## 4. The voice check (10 min)

**Why:** the "Fitts" voice exists now (`hqtfv6GKvF2d5FpBDEh7`, in `.env.local`). In a
development build Settings fills the voice ID in from `.env.local` on its own; in a release,
paste it in Settings › Voice & appearance › ElevenLabs voice ID. Listening needs your mic.

1. Optional: `pnpm tsx scripts/verify/p11-tts.ts` should print `ok: true` (one short line).
4. Follow `scripts/voice-check.md`: mic, speakers, barge-in, always listening, fallback.

## 4b. Register the Fitts GitHub App (10 min) — Sign in with GitHub

**Why:** Fitts now signs you in to GitHub itself (Settings › Keys › GitHub) instead of quietly
using `gh`. That needs a GitHub App, which only you can register. Until then Settings says
it isn't set up, and Fitts falls back to `gh` as before.

1. Go to github.com › Settings › Developer settings › GitHub Apps › **New GitHub App**.
2. Name: `Fitts` (or `Fitts by Allen` if taken). Homepage URL: `https://fitts.allenzheng.com`.
   Callback URL: the same (device flow doesn't use it). Leave "Expire user authorization
   tokens" **on** (Fitts refreshes them).
3. Check **Enable Device Flow**. Under Webhook, uncheck **Active**.
4. Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**,
   **Checks: Read-only**, **Pages: Read-only** (Metadata: Read-only is automatic). Nothing
   else, no account permissions.
5. "Where can this GitHub App be installed?": **Any account** if others will use Fitts, else
   **Only on this account**. Create it.
6. Send me the **Client ID** (starts with `Iv`; it's public, not a secret) and the app's URL
   name (the part after `github.com/apps/`). I'll put both in `src/main/github/auth.ts`.
7. In Fitts: Settings › Keys › GitHub › **Sign in with GitHub**, enter the code on GitHub,
   then **Choose which repositories Fitts may use** and pick AllenZheng (and fitts if you like).

## 5. Publish the beta release and install it fresh on Windows (20 min, after 1)

**Why:** it publishes a release and installs software. The unpacked build already works
locally: `pnpm --filter @fitts/desktop dist:dir`, then `tests/bench/packaged.bench.ts`
launches `Fitts.exe` and plays the replay.

```
git tag v0.9.0-beta && git push origin v0.9.0-beta
```

CI then builds Windows, macOS and Linux, and publishes them to Releases. Then:

1. Download `Fitts-Setup.exe` from Releases and install it (SmartScreen: More info
   → Run anyway).
2. Open it, then **Watch a recorded run** (no keys).
3. Add your key and open the demo/chat clone.

Check that the macOS job's first-launch e2e passed (the hiddenInset title bar, traffic
lights and ⌘ labels are otherwise unverified).

## 6. A live site that verifies through GitHub Pages (10 min)

**Why:** it reads your GitHub account (`gh api`), which this session didn't do.

1. In Fitts, open Add a project › Live site, then Connect GitHub Pages. Your Pages sites
   should be listed. Pick one: it says Verified.
2. Open it. Main re-checks ownership, then the crawl runs audit-only.
3. Optional: try the DNS (`_fitts-verify.<domain>` TXT) and file
   (`/.well-known/fitts-verify.txt`) methods on a domain you control.

## 7. One macOS pass (30 min, needs a Mac)

**Why:** the macOS UI has only been checked by CI, if that. Install the dmg ("Open Anyway"),
then check the title bar, the ⌘ shortcuts, mic permission, and a demo run.

## 8. Log Muse Code in inside WSL (5 min) — optional

**Why:** fixes currently run on the in-process fixer fallback, which works: 8 of 9 verified in
the P9 bench. Muse Code is the spec's primary path, and this session must not pass keys to it.

```
wsl -e bash -lc "muse login"
pnpm verify:v6
```

Using Muse Code for real fix jobs, once logged in, is follow-up work: the fallback is what's
wired.

## 9. Housekeeping (2 min)

- **Temp folders:** delete the leftover benchmark folders (`fitts-p9-*`, `fitts-fix-*`) in
  `%TEMP%`. The session's permission rules blocked a wildcard delete there; the benches now
  clean up after themselves.
