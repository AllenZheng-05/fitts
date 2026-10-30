# Fitts

Fitts is a desktop agent that uses your website the way people do. It finds usability problems
against Nielsen's ten heuristics, plus accessibility, performance and look-and-feel. Then it
fixes the code, checks each fix, and opens a pull request. You can talk to it by chat or voice
while it works.

## Try it

**Watch a recorded run (no keys needed).** On the Welcome screen, choose **Watch a recorded
run**. It plays a real run on the demo messaging app at 4× speed: the interview, the crawl,
findings with outlines and mockups, and verified fixes.

**Run it on your own project.** Add a Meta Model API key on Welcome, then choose your
project's folder. Fitts starts your dev server, interviews you about who the site is for, and
gets to work.

### Install

Download the installer for your system from
[Releases](https://github.com/AllenZheng-05/fitts/releases). The builds are unsigned:

- **Windows:** SmartScreen says "Windows protected your PC". Choose **More info → Run
  anyway**.
- **macOS:** open the app once, then go to System Settings › Privacy & Security and choose
  **Open Anyway**.
- **Linux:** make the AppImage executable (`chmod +x Fitts-*.AppImage`) and run it.

Fitts needs **Node.js** and **git** for local projects, and the **GitHub CLI** (`gh auth
login`) to open pull requests.

## What it does

1. **Interview.** One question at a time, Fitts learns what the site is for, who uses it, and
   how it should feel. You can click around your site while you answer.
2. **Crawl.** It visits every page it can reach and tries every main control.
3. **Check.** Deterministic probes measure the problems: contrast, tap-target size, focus,
   leaked placeholders, label consistency, loading feedback, network waste and broken links.
   Five reviewer personas look at each page too.
4. **Report.** Findings are shown only when the evidence is strong enough. The rest become
   suggestions.
5. **Fix.** Each fix happens in its own git worktree on a `fitts/` branch. Fitts re-runs the
   check against that branch's own dev server, and opens the PR only when the problem is gone
   and nothing new broke. Undo closes the PR, or opens a revert if it was merged.

The safety controls:

- **The gate.** It holds destructive requests (a real `DELETE`, a payment) at the network
  until you answer.
- **Modes.** Plan only never clicks. Ask every action asks before each tap.
- **Run controls.** Stop (Ctrl+. or ⌘.), pause, take the wheel, and rewind.
- **Live sites.** These are audit-only. They have to prove they're yours (through your host,
  a DNS TXT record, or a file) before Fitts opens them.

Every model call is in a cost ledger with a cap you set. Fitts warns you at 80% of the cap and
pauses at 100%.

## Develop

```
pnpm install
pnpm dev            # the app with hot reload
pnpm typecheck
pnpm lint
pnpm test           # unit and component tests (no network)
pnpm test:e2e       # Electron flow tests and axe checks (no network)
pnpm bench:chat     # one real audit of demo/chat, scored against its 25 planted issues
pnpm --filter @fitts/desktop dist:win   # a Windows installer in apps/desktop/release
```

For development keys, copy `.env.example` to `.env.local` at the repo root (it's gitignored).
Development builds use these when Settings has none; packaged builds never read the file.

```
META_API_KEY=            # required for real runs
BASETEN_API_KEY=         # optional: Muse Spark Open (Open weights profile)
ELEVENLABS_API_KEY=      # optional: Fitts's voice (otherwise the system voice)
ELEVENLABS_VOICE_ID=     # optional: the "Fitts" voice in your ElevenLabs account
FITTS_DEV_SPEND_CAP_USD=25
```

- **`apps/desktop`:** the Electron app:
  - `main/`: windows, the site view, the gate, fixes and voice sockets;
  - `agent/`: the crawler, reviewers, fixer and model calls, in their own process;
  - `renderer/`: the UI.
- **`packages/schema`:** shared types and the run-event reducer.
- **`packages/probes`:** the in-page probes.
- **`packages/vite-plugin`:** stamps elements with their source location in dev.
- **`demo/chat`, `demo/hartwell`:** the demo targets.
  - `demo/chat/PLANTED.md` lists demo/chat's planted issues.
  - hartwell is a funeral home site with the wrong look.

Design and decisions: `docs/SPEC-phase2.md`, `docs/DECISIONS.md` and `docs/PROGRESS.md`.

## Status

This is a beta. Not verified yet:

- the macOS build;
- real (non-dry-run) PRs;
- ElevenLabs on a free account (Fitts falls back to the system voice);
- the Vercel, Netlify and Cloudflare connections. These are placeholders: use GitHub Pages,
  DNS or a file to verify a live site.
