# Fitts

Fitts is a desktop agent that uses your website or Android app the way people do. It reads your
code, walks the flows a person would, and finds usability problems against Nielsen's ten
heuristics plus accessibility, performance and look-and-feel. Then it fixes the code, checks each
fix on its own branch, and opens a pull request. You can talk to it by chat or voice while it
works. Built from scratch during the Meta Global AI Developer Hackathon, Oct 28 – Nov 4, 2026.

[fitts.allenzheng.com](https://fitts.allenzheng.com) · [Roadmap](docs/ROADMAP.md)

## Try it without keys

Open the recorded runs at [fitts.allenzheng.com/runs/](https://fitts.allenzheng.com/runs/) in
any browser. Each is a real run's report: what Fitts understood, every step it took with its
Noticed lines, the findings with their evidence and repro steps, the verified fixes, and the App
Map. No install and no keys needed.

## Quickstart

1. Install Fitts (below), or run it from source with `pnpm install && pnpm dev`.
2. Add a Meta Model API key on Welcome. From source, you can instead copy `.env.example` to
   `.env.local` at the repo root and fill in the keys you have:

   ```
   META_API_KEY=            # required for real runs
   BASETEN_API_KEY=         # optional: Muse Spark Open on Baseten
   ELEVENLABS_API_KEY=      # optional: Fitts's voice (otherwise the system voice)
   ELEVENLABS_VOICE_ID=     # optional: the "Fitts" voice in your ElevenLabs account
   ```

   `.env.local` is gitignored, and packaged builds never read it.
3. Choose your project's folder. Fitts starts your dev server (or Metro and the Android emulator
   for an Expo app), reads the code, interviews you about who it's for, and gets to work.

## Bonus categories

- **Best Agentic Use-Case.** A decider picks each next ability (explore, journeys, the device
  matrix, reviews, fixes) from the run's state. Journeys pursue a goal from screenshots, step by
  step. The gate holds destructive requests at the network until the owner answers. And Fitts
  never ends a run on its own: it calls `propose_finish`, and only the owner presses Finish.
- **Best Build on Meta Open-Weight Models.** Muse Spark Open, served on Baseten, is a
  load-bearing stage. In the Quality profile it's one of the five reviewers, independent of the
  hosted models. In the Open profile it runs every reviewer, the merging of findings and the
  theme check, with hosted Muse Spark 1.3 alongside for the rest.
- **Best Creative Build.** A redesign pairs Muse Wonder's design directions with Muse Image
  illustrations, shown side by side before anything changes in the code.

## Meta models and their jobs

| Model | Job |
|---|---|
| Muse Spark 1.3 | The interview, reading the code into an App Model, each crawl decision, journeys from screenshots, the chat, and the fixer when Muse Code isn't available |
| Muse Wonder 1.0 | Two of the five reviewers, merging findings, the theme check, judging surprising page changes, redesign directions |
| Muse Code | Meta's coding agent, running Muse Wonder: makes the fixes inside an edit allowlist, and does the second pass of reading the code |
| Muse Spark Open (Baseten) | An independent reviewer in Quality; in the Open profile, every reviewer, the merging and the theme check |
| Muse Image 1.0 | Mockups of a fix and redesign illustrations |
| SAM 3.1 | Outlines the element a finding is about, and the element that moved in a surprise |
| Muse Voice Transcribe 1.0 | Turns the owner's voice into chat and commands |

## Install

Download the installer for your system from
[Releases](https://github.com/AllenZheng-05/fitts/releases/latest). The builds are unsigned, so
each system asks once:

- **Windows** (`Fitts-Setup.exe`): SmartScreen says "Windows protected your PC". Choose **More
  info → Run anyway**.
- **macOS** (`Fitts-arm64.dmg` for Apple silicon, `Fitts-x64.dmg` for Intel): drag Fitts to
  Applications and open it once. When macOS blocks it, go to System Settings › Privacy & Security
  and choose **Open Anyway**.
- **Linux** (`Fitts.AppImage`): `chmod +x Fitts.AppImage`, then run it.

Fitts needs **Node.js** and **git** for local projects, and the **GitHub CLI** (`gh auth login`)
or Sign in with GitHub to open pull requests. Muse Code runs natively or, on Windows, in WSL.
Android needs the Android SDK, an emulator and a development build of the app.

## What it works on

- **Local web projects:** Vite, Next.js, Create React App, SvelteKit, Astro and plain sites.
  Fitts runs the project's own dev server, and fixes land on a `fitts/` branch in a worktree, so
  your working tree is never touched.
- **Live sites,** audit only. A site has to prove it's yours (through your host, a DNS TXT
  record, or a file) before Fitts opens it.
- **Android apps built with Expo or React Native,** on the Android emulator. Fixes are checked
  on the device. The fixed version is shown as the app's web build at phone width, marked as an
  imitation; the emulator stays on the live app.

## How it works

1. **Understand.** Fitts reads the code into an App Model (pages, journeys, forms, theme tokens)
   and shows you what it understood.
2. **Interview.** One question at a time, it learns who the site is for and how it should feel.
3. **Explore.** It walks the journeys from the App Model and tries every main control, across
   phone, tablet, desktop, 320 px reflow and landscape.
4. **Check.** Deterministic probes measure contrast, target size, focus, labels, leaked
   placeholders, loading feedback, network waste, broken links and content that jumps. Five
   reviewer personas look at each page, and a judge looks at the frames around surprises.
5. **Report.** A finding has numbered steps, what should happen, what did, and the source file
   and line, cut down to the fewest steps that still show it, with a Playwright test (or a
   Maestro flow on Android). Weak evidence becomes a suggestion instead.
6. **Fix.** Each fix is checked again on its own branch. Fixes that pass join one pull request
   for the run. At the end, the App Map shows every page Fitts reached and what it found there.

The safety controls: the gate holds destructive requests (a real `DELETE`, a payment) until you
answer; Plan only never clicks and Ask every action asks before each tap; Stop is Ctrl+. (⌘.);
and every model call goes into a cost ledger with a cap you set.

## Benchmarks

Two demo apps with planted problems, each scored against its answer key. The key is hidden from
Fitts during the run. These are single runs; reviewers vary from run to run.

| Benchmark | Run | Found | Precision |
|---|---|---|---|
| `demo/chat`, 33 planted (19 structure-detectable, 14 judgment) | Economy, Nov 2, $0.14 | 27/33 (structure 18/19, judgment 9/14) | 84% of findings at severity 2+ were planted (27/32); 5 weren't, over the bench's bar of 2 |
| Basil & Ember's Android app, 10 planted | Economy, Nov 3, $2.49 | 9/10 | 3 unplanted at severity 2+ |

On an earlier Android run (Nov 2), Fitts also fixed three findings and checked each fix. One of
them was the brand drift: restored from the app's own brand cues, every color came within the bench's
distance of the answer key, with the same fonts. Every run, with its id and the bad numbers, is
in `docs/PROGRESS.md`.

Against other approaches on `demo/chat` (pre-registered in `docs/bench/PLAN.md`, every run in
`docs/bench/RESULTS.md`): axe alone found 4/33; Fitts's own probes with no models found 25/33
(structure 18/19, judgment 7/14) for free; Fitts Economy found 28/33 in both of its runs
(structure 19/19, judgment 9/14) for about $0.16. Quality and Economy without the judge also found
28/33, so on this app the bigger models didn't add recall. The probes carry the structural
issues; the models add the judgment ones.

## Check the results yourself (offline)

The tests run with no network and no keys. Model answers come from recorded fixtures in
`apps/desktop/tests/fixtures/llm/`, and sites from the demos in `demo/`:

```
pnpm install
pnpm typecheck
pnpm lint
pnpm test           # unit and component tests
pnpm test:e2e       # Electron flow tests and axe accessibility checks
BENCH_OFFLINE=1 pnpm bench:chat   # an audit of demo/chat with the probes alone, scored for free
```

The paid benchmarks call Meta's models for real and need a key:

```
pnpm bench:chat     # a real audit of demo/chat, scored against its 33 planted issues
pnpm bench:android  # a real audit of the Android demo on the emulator (10 planted issues)
```

## Known limits

- This is a beta. The Windows build is tested; the macOS and Linux builds come from CI and are
  less tested. All three are unsigned.
- Android means Expo or React Native apps on the emulator, with a development build installed.
  Expo's floating Tools button can hide the app's header from Fitts: turn it off in the dev
  menu.
- Live sites are audit only: Fitts has no code to fix there.
- A run needs Meta's models to be reachable; when they aren't, Fitts pauses and says so.
- Cut for the deadline, with reasons, in the last section of the [roadmap](docs/ROADMAP.md).

## Develop

- **`apps/desktop`:** the Electron app:
  - `main/`: windows, the site view, the gate, fixes, Android and voice;
  - `agent/`: the crawler, reviewers, fixer and model calls, in their own process;
  - `renderer/`: the UI.
- **`packages/schema`:** shared types and the run-event reducer.
- **`packages/probes`:** the in-page probes.
- **`packages/vite-plugin`:** stamps elements with their source location in dev.
- **`demo/`:** the demo targets.
  - `demo/chat` is a messaging app; `demo/chat/PLANTED.md` lists its planted issues.
  - `demo/hartwell` is a funeral home site with the wrong look.
  - `demo/basil-ember` is a restaurant site generated by Muse Code from one prompt and left
    untouched: its problems are its own.
  - `demo/basil-ember-android` is the restaurant's Expo ordering app; `PLANTED.md` lists its
    planted issues.

`pnpm --filter @fitts/desktop dist:win` builds a Windows installer in `apps/desktop/release`.
Design and decisions: `docs/SPEC-phase4.md` (and the earlier phases' specs),
`docs/DECISIONS.md` and `docs/PROGRESS.md`.
