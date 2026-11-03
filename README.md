# Fitts

Fitts is a desktop agent that uses your website or Android app the way people do. It reads your
code, walks the flows a person would, and finds usability problems against Nielsen's ten
heuristics plus accessibility, performance and look-and-feel. Then it fixes the code, checks each
fix on its own branch, and opens a pull request. You can talk to it by chat or voice while it
works. Built from scratch during the Meta Global AI Developer Hackathon, Oct 28 – Nov 4, 2026.

[fitts.allenzheng.com](https://fitts.allenzheng.com) · [Roadmap](docs/ROADMAP.md)

## Try it without keys

Open the recorded runs at [fitts.allenzheng.com/runs/](https://fitts.allenzheng.com/runs/) in
any browser. Each is a real run's report: what Fitts understood, the findings with their
evidence and repro steps, the verified fixes, and the App Map. Each report shows the Noticed
lines behind every finding. No install and no keys needed.

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

Apps with planted problems, each scored against its answer key, which is hidden from Fitts during
the run. The comparison was pre-registered in `docs/bench/PLAN.md` before any run; every run,
including the stopped one, is a row in `docs/bench/RESULTS.md`.

**`demo/chat`, 33 planted** (19 structural, S1; 14 that need judgment, S2):

| Approach | Runs | Found | S1 | S2 | Precision, severity 2+ | Cost per run |
|---|---|---|---|---|---|---|
| axe alone | 1 | 4/33 | 4/19 | 0/14 | 50% | free |
| Fitts, probes only (no models) | 1 | 25/33 | 18/19 | 7/14 | 93% | free |
| Fitts Economy (Muse Spark) | 2 | 28/33 both | 19/19 | 9/14 | 88% | $0.15–0.17 |
| Fitts Economy, no Wonder judge | 2 | 28/33 both | 19/19 | 9/14 | 90% | $0.08–0.09 |
| Fitts Quality (Spark, Wonder, the Wonder judge) | 2 | 28/33 both | 19/19 | 9/14 | 85–88% | $1.79–1.84 |
| Fitts Open (Spark Open on Baseten) | 2 | 26–27/33 | 19/19 | 7–8/14 | 87% | $1.42–1.56 |

Fitts's probes catch what can be measured: with no model at all they find 18 of the 19
structural issues. Meta's models add the judgment issues, S2 from 7 to 9 of 14. On this app,
Quality and the Wonder judge added no recall over Economy. A third Quality run stalled when Meta's
models stopped answering and is recorded as stopped.

**A held-out app it never saw** (Loopline Bikes, a bike-rental site: 16 planted, 8 S1 and 8 S2,
plus 3 traps that look wrong but are right). Both runs were blind, and their findings were
committed before the key was revealed; the key matched the SHA-256 sealed in the app's README.

| Approach | Found | S1 | S2 | Traps tripped | Precision | Cost |
|---|---|---|---|---|---|---|
| axe alone | 2/16 | 2/8 | 0/8 | 0/3 | 100% (2/2) | free |
| Fitts Economy | 6/16 | 4/8 | 2/8 | 1/3 | 30% (6/20) | $1.55 |

On an app it never saw, Fitts found 6 of 16 against axe's 2: the missing labels and names, the
removed focus outline, the frame sizes a keyboard can't choose, the faint hint text, the silent
Save and the promo banner that shifts the grid. What it missed, it mostly never reached: the crawl
didn't complete a booking, so the checkout's later steps, the confirmation page and the shop's own
rules (hourly prices with daily-only booking, "free cancellation" with a 50% fee, a kids' bike
with an adult height minimum) went unchecked. Its date and time fields were typed into instead of
picked, and the booking journey was skipped because it ends in a payment; both are fixed since.

Precision was low, and the false alarms are Fitts's own. Each of the 14 findings that match
nothing planted was checked against the running app: 9 are false, including all four at
severity 4 (a Rent button "opening a different bike", focus "stuck" on Settings), 2 are real but
unplanted (Back resets the bike filter; a focused button pushed off-screen by the promo banner),
and 3 are measured right but are style calls. It also flagged the skip link, one of the traps.

**Basil & Ember's Android app, 10 planted:** 9/10 on Economy (Nov 3, $2.49), with 3 unplanted
findings at severity 2+. On an earlier run Fitts also fixed three findings and checked each fix;
one was the brand drift, restored from the app's own brand cues to within the bench's color
distance of the answer key, with the same fonts.

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
