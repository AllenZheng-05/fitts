// Types for the scripted runs the MockRunEngine plays (SPEC §9.3).
import type { Brief, ChatItem, GateRequest, Mode, RunState } from '@fitts/schema';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ChatItemInput = DistributiveOmit<ChatItem, 'id'>;

export type Handler<T = string> = (value: T, s: RunState, ctx: BeatContext) => void;

/** What a beat can do to the run it belongs to. Every call edits the current draft. */
export interface BeatContext {
  readonly mode: Mode;
  readonly profile: MockProfile;
  /** True in Ask every action / Ask when unsure: Fitts asks before changing anything. */
  readonly asks: boolean;
  post(item: ChatItemInput): string;
  say(text: string): string;
  think(text: string): string;
  /** A question card. Blocking questions hold the script until answered. */
  ask(question: { text: string; options: string[]; blocking: boolean }, onAnswer?: Handler): string;
  /** Runs when the card `itemId` (a question or edge-state card) is answered. */
  onAnswer(itemId: string, handler: Handler): void;
  /** Fix approval: a batch card in Ask modes, applies in Autonomous/Dangerous, proposes in Plan. */
  requestApproval(findingIds: string[], onApproved: Handler<string[]>): void;
  /** The destructive-action gate (§7.8). Skipped in Dangerous mode. */
  requestGate(gate: GateRequest, onDecision?: Handler<'deny' | 'other' | 'allow'>): void;
  /** Redesign directions: auto-picks in Autonomous/Dangerous, waits for a pick in Ask modes. */
  offerDirections(
    options: { id: string; name: string; swatches: string[] }[],
    autoPickId: string,
    onPicked: Handler,
  ): void;
  /** Starts fixes; each finishes `durationMs` of run time later (or at `doneAtMs`). */
  startFixes(findingIds: string[], opts?: { doneAtMs?: number[]; durationMs?: number }): void;
  /** Schedules work in run time: it waits while the run is paused or waiting on the user. */
  at(atMs: number, fn: (s: RunState, ctx: BeatContext) => void): void;
  /** Schedules work in real time (scaled by the Scenario panel speed). */
  after(ms: number, fn: (s: RunState, ctx: BeatContext) => void): void;
  /** Ends the run: phase done, nothing acting. */
  finish(): void;
  resume(): void;
  pause(): void;
  takeWheel(): void;
}

export interface Beat {
  id: string;
  /** Run time in ms at which the beat plays (SPEC §9.5 tables). */
  atMs: number;
  /** Shown in the Scenario panel's "Jump to beat". */
  label: string;
  apply: (s: RunState, ctx: BeatContext) => void;
}

export interface Scenario {
  id: string;
  label: string;
  beats: Beat[];
}

export interface InterviewStep {
  /** Which brief fields this answer fills. The mock maps any text to the next step. */
  fill: (text: string) => Partial<Brief>;
  /** Fitts's next line, 900ms after the answer. */
  reply: (s: RunState, ctx: BeatContext) => void;
}

/** Everything the mock engine needs to play one project's runs. */
export interface MockProfile {
  projectId: string;
  /** Short name in the header, e.g. "demo/chat". */
  name: string;
  userFirstName: string;
  runNumber: number;
  /** The screen the interview follow-up mentions ("I can see the compose screen"). */
  screen: string;
  defaultMode: Mode;
  interview: InterviewStep[];
  audit: Scenario;
  /** Checks listed by "See what I checked" on the nothing-found card. */
  checks: string[];
  /** Change title, PR number and cost per finding, used when a fix finishes. */
  fixes: Record<string, { title: string; prNumber: number; costUsd: number }>;
}

export const isBriefReady = (brief: Brief): boolean => Boolean(brief.for && brief.who);
