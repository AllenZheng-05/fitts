// /runs/ and the "see a real run" links. Fitts's voice: plain, warm, specific; no exclamation marks.
// The list itself is runs.json, written by `pnpm --filter @fitts/run-report site` (never by hand).
import manifest from './runs.json' with { type: 'json' };

export interface PublishedRun {
  id: string;
  project: string;
  runId: string;
  startedAt: string;
  minutes: number;
  shown: number;
  suggestions: number;
  verified: number;
  review: number;
  rolledBack: number;
  spentUsd: number;
  calls: number;
  label?: string;
}

export const published: { featured: string; runs: PublishedRun[] } = manifest;

/** The run Home, Showcase and the README point to. */
export const featuredRun = published.runs.find((r) => r.id === published.featured);
export const runPath = (id: string) => `/runs/${id}/`;

export const runsCopy = {
  title: 'Real runs',
  lead: 'A whole Fitts run as a web page, made from the log the app saved: what Fitts understood, the App Map, every finding with its screen, what it noticed, how to reproduce it and the test it wrote, every fix with its evidence, and what each model call cost. No install, no keys.',
  see: 'See a real run. No install, no keys.',
  /** Download, under What you need: “Try it without keys” points here (the replay is gone). */
  noKeyLead: 'No key yet?',
  open: 'Open the report',
  listTitle: 'Published runs',
  stats: {
    found: '{n} findings',
    suggestions: '{n} suggestions',
    verified: '{n} fixed and verified',
    review: '{n} checked by review',
    rolledBack: '{n} rolled back',
    spent: '{usd} in {calls} model calls',
    minutes: '{n} min',
  },
  noFixes: 'This run ended before any fixes were approved: Fitts asks before it changes code.',
  shareTitle: 'Share a run with your team',
  share:
    'Any run exports as a folder of static files: open index.html, zip it, or put it on any static host. Keys, saved logins and paths on your computer are left out, and the folder is checked for them before it’s written.',
  shareCommand: 'pnpm --filter @fitts/run-report export <run folder> <out folder>',
  shareNote:
    'Runs are in Fitts’s data folder, under projects/<project>/runs/. An “Export as web page” item in the app is coming.',
};

export const fill = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_m, k: string) => String(v[k] ?? ''));

export const usd = (n: number) => `$${n.toFixed(2)}`;
