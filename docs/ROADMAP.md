# Fitts roadmap: after the hackathon

What's built during the Meta Global AI Developer Hackathon (Oct 27 – Nov 4, 2026) is described
in `SPEC-phase2.md`, `SPEC-phase3.md` and `SPEC-phase4.md`. This page is what comes next, and
why. Each item builds on something that already exists, so the path from here is short.

Anything cut from Phase 4 to make the deadline is listed at the end.

---

## 1. Every kind of software, not just websites and Android

Fitts's agent never touches a browser directly: it asks for a snapshot, a screenshot, a tap or a
keystroke, and gets back what happened. Phase 4 puts a website (Chromium over the DevTools
Protocol) and an Android app (the emulator over adb) behind that same interface. Every new
platform is one more implementation of it, with that platform's own accessibility engine as the
ground truth.

| Platform | How Fitts sees and drives it | Its accessibility engine | Code it can fix |
|---|---|---|---|
| **iOS** | Simulator (`simctl`) + XCUITest / WebDriverAgent on a Mac host | XCTest `performAccessibilityAudit` (contrast, hit regions, Dynamic Type, clipped text) | SwiftUI and UIKit (via `accessibilityIdentifier`), React Native, Flutter |
| **macOS apps** | The Accessibility API (`AXUIElement`), ScreenCaptureKit | XCTest audits, Fitts's own checks | Swift, Electron, Tauri |
| **Windows apps** | UI Automation (FlaUI / NovaWindows) | Axe.Windows (the engine behind Accessibility Insights) | WPF, WinUI, WinForms, Electron |
| **Linux apps** | AT-SPI over Xvfb/VNC | Fitts's own checks (there's no first-party engine, a gap Fitts can fill) | GTK, Qt, Electron |
| **Real phones** | USB / Wi-Fi adb; WebDriverAgent on devices | The same as above | The same as above |

**Cloud devices.** Not everyone has a Mac, a Windows machine and five phones. The same interface
can drive remote machines: agent-ready sandboxes (for example the open-source Cua SDK for Linux,
Windows, macOS and Android), Android clouds (Genymotion SaaS, Google's Developer Device Platform),
real-device farms (AWS Device Farm, BrowserStack, Sauce Labs) and cloud Macs for iOS. One audit
could then check a product on every platform its users have, in parallel, and open one PR per
codebase.

**More native stacks.** Jetpack Compose (`testTag` → source), Flutter (debug builds already know
each widget's source location), SwiftUI, and React Native with build-time source stamps through
Metro, the way the Fitts plugin does for Vite today.

## 2. Where developers already work

- **A VS Code extension** (and Cursor, Windsurf, other VS Code–based editors): Fitts's findings
  as diagnostics at their file and line, fixes in the editor's own diff view, the repro steps in
  a hover, "Open in Fitts" for the live view. The desktop app stays the product; the extension
  is a window into it.
- **An MCP server for Fitts**, so coding agents (Muse Code, Claude Code, Copilot and others) can
  call it: "audit this page", "check that my change didn't break the checkout flow", "give me the
  repro for finding 4". Every agent that writes UI code gets a usability reviewer.
- **Fitts in CI**: a GitHub Action and GitHub App that run Fitts headless on every pull request's
  preview deployment and comment with what changed for users: new findings, fixed findings, the
  App Map diff, a replay link. Replay mode (built) already plays a run with no keys.
- **Figma**: compare the built site with its design (spacing, type, color drift) and push a
  redesign's style board to Figma as a component sheet.

## 3. Deeper judgment

- **Learning the owner's taste.** Phase 4 remembers what the owner says is and isn't a problem.
  Next: a small preference model trained on the owner's rankings, so Fitts's own priorities move
  toward theirs over time, per project and per team.
- **Fine-tuning on accepted fixes.** Every verified, merged fix is a training example. Muse Spark
  Open, served on the owner's hardware or a partner's, can be tuned on them, so fixes match a
  codebase's style and pass its checks first time.
- **Code-coverage-guided exploration.** Measure which components the crawl actually rendered and
  steer journeys toward the rest, so "every feature was checked" is a measured claim.
- **Multi-language code understanding** with precise indexing (SCIP), for monorepos, backends that
  shape the UI, and non-JavaScript front ends.
- **Flows that leave the app**: test inboxes for sign-up and password-reset emails, payment
  sandboxes, OAuth with test accounts, and two users at once (invite a teammate, chat with them).
- **Screen reader runs**: drive NVDA, VoiceOver and TalkBack for real and judge what they announce,
  not just what the accessibility tree says.
- **Cognitive accessibility and content**: reading level, plain language, consistent help,
  timeouts, and support for people with memory or attention differences.
- **Other languages and right-to-left layouts**: run the site in each locale it ships, catch
  untranslated strings, truncation and mirrored layouts that break.
- **Animation and motion**: SAM 3.1's video tracking to follow what moves, how fast, and whether
  it respects reduced motion.

## 4. Real-world speed

- **Field data**: pair Fitts's lab measurements with real users' Core Web Vitals (the Chrome UX
  Report, or the site's own analytics) so fixes target the slow pages people actually visit.
- **Real devices**: measure on actual low-end phones in the device clouds above.
- **Regression watching**: re-run the journeys on every deploy and flag when a page or flow gets
  slower.

## 5. For teams and over time

- **Scheduled audits** of live sites, with a trend line per page: findings, fixes, speed,
  accessibility.
- **Shared projects**: findings, the App Map and the owner's preferences shared across a team,
  with roles (who can approve fixes, who decides taste).
- **Compliance reports**: a WCAG 2.2 AA conformance summary per page with evidence and repros,
  for the European Accessibility Act and similar rules.

## 6. Private by default

- **On-device models**: Muse Glimmer for the parts that don't need a large model (snapshot
  summaries, observation wording, dedupe), so less of a project's code and screens leave the
  machine.
- **An open-weights mode** end to end on Muse Spark Open (Phase 2 already runs one reviewer on
  it), for teams that can't send code to any hosted API.

## 7. Shipping

- Signed and notarized builds for Windows and macOS, automatic updates, a Linux package.
- A guided first run that sets up the Android emulator and Muse Code.

---

## Cut from Phase 4 for the deadline

(Claude Code adds each cut here, with the reason, as it applies `SPEC-phase4.md` §13's cut
order.)
