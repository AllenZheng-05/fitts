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
} as const;
