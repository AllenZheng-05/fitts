// All user-facing text lives here and follows Fitts's voice (SPEC §8).
// Placeholders use {name} and are filled with `format()` from lib/format.ts.

export const copy = {
  app: {
    name: 'Fitts',
    scaffoldCaption: 'Scaffold ready. Screens arrive milestone by milestone.',
  },
  severity: {
    short: 'Sev {n}',
    list: 'Severity {n}',
    detail: 'Severity {n} · {name}',
    names: {
      0: 'Not a problem',
      1: 'Cosmetic',
      2: 'Minor',
      3: 'Major',
      4: 'Catastrophic',
    },
  },
  stepper: {
    label: 'Run progress',
    interview: 'Interview',
    audit: 'Audit & fix',
    done: 'Done',
    completed: 'completed',
  },
  status: {
    micOn: 'Mic on',
    costDuring: 'Spent {spent} of {cap}',
    costTotal: 'Spent {spent}',
  },
  slider: {
    label: 'Compare before and after',
    valueText: '{n}% showing how it is now',
    before: 'NOW',
    after: 'WITH FIX',
  },
  overlay: {
    close: 'Close',
  },
  // What Fitts says. Canonical strings from SPEC §8 are kept exactly; **bold** spans are
  // rendered by the chat. Scenario-specific narration lives with its scenario in mock/.
  fitts: {
    interviewOpener:
      "Hi {name}! Before I touch anything, I'd love to hear about this site. What's it for?",
    interviewFollowUp: 'Got it. I can see the {screen} screen right now. Where do they get stuck?',
    interviewTieBack:
      'That gives me two things to test first: whether sending shows any feedback, and whether the buttons agree on their names. **How should the app feel when they open it?**',
    interviewWrapUp: "Thanks, that's what I needed. Start the audit whenever you're ready.",
    interviewAgain: 'Anything changed since last time?',
    readyBar: 'I know enough to start',
    firstFindings:
      'Found the first two from your list. The recipient shows as "(null)", and this button says NEXT while the last one said Send Text.',
    nonBlockingLabel: "When you get a sec · I'm testing other pages meanwhile",
    blockingLabel: 'I need you · paused',
    done: "All done. I verified 24 fixes and opened 9 pull requests. Two changes didn't pass my checks, so I rolled them back. Want me to try those again with a different approach?",
    redesign:
      'You told me this site is for families who just lost someone. Hot pink, confetti shapes and a bouncy font read as celebratory, which can feel hurtful at a hard moment.',
    handBack: 'Thanks. You went through {path}. Want me to test that path properly?',
    handBackNoPath: 'the page',
    stopped: 'Stopped. What should I do instead?',
    ackQueued: "Got it. I'll get to that right after this step.",
    ack: "Got it, I'll work that in.",
    briefSaved: "Got it, I'll keep that in mind from here.",
    dismissFollowUp: 'Want to tell me why? It helps next time.',
    gateDenied: "Okay, I won't tap it. Moving on.",
    gateOther: "Okay, I'll test something else on that page instead.",
    gateAllowed: "Tapping it once. I'll tell you what happens.",
    gateSkippedDangerous: 'Dangerous mode is on, so I tapped "{action}" without asking.',
    planOnlyFixes: "I'd fix these {n}, but you asked me to only look. They're in the findings.",
    pushReady: 'The fix for "{title}" is ready. Should I open the pull request?',
    stoppedRun: 'Stopped the run. I kept all {n} findings and nothing touched your branch.',
    keepGoing: 'Okay, carrying on.',
    testingPath: 'Testing your path',
    resumed: 'Picking up where I left off.',
    skipped: 'Skipped that step. On to the next one.',
    budgetRaised: 'Thanks. The cap is now {cap}. Carrying on.',
    budgetEconomy: 'Switching to Economy for the rest of the run.',
    serverRestarted: "Restarted the dev server. It's answering again, so I'm carrying on.",
    waitingForYou: "Okay, I'll wait. Tell me when it's back.",
    apiRecovered: 'The connection is back. Carrying on.',
    checksDone: "Here's everything I checked.",
    loginAdded: "Thanks. I'll use the test login for /settings.",
    commitFirst: "Okay. Commit when you're ready, then start the audit again.",
    savedChanges: 'Saved your 3 files on a safety branch. Starting the audit.',
    pathYes: 'Yes',
    pathNo: 'No',
    pushYes: 'Open the pull request',
    pushNo: 'Not now',
  },
} as const;
