// Versions of the user's site beside the live one (the Before/After switch, a fix's live
// preview): main serves each from a worktree under its own site id, and the site view shows it
// like any live site. A version opens when a view needs it and closes when the view goes.
import { versionSiteId, type RunState, type SiteVersion } from '@fitts/schema';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { bridge } from '../lib/bridge';
import { getEngineKind } from './engine';
import { useLiveSites } from './live-site';

/** Opens `version` under `${projectId}.v.${name}` while mounted; null closes it. */
export function useSiteVersion(
  projectId: string,
  runId: string,
  name: string,
  version: SiteVersion | null,
): string {
  const siteId = versionSiteId(projectId, name);
  const key = version ? JSON.stringify(version) : '';
  useEffect(() => {
    const site = bridge().site;
    if (!key || !site || getEngineKind() !== 'ipc') return;
    site.openVersion(siteId, projectId, runId, JSON.parse(key) as SiteVersion);
    return () => site.close(siteId);
  }, [siteId, projectId, runId, key]);
  return siteId;
}

/** The run's branch, once a verified change is on it (every fix lands on the same one). */
export function fixedBranch(run: RunState): string | undefined {
  return run.changes.find((c) => c.status === 'verified' && c.branch)?.branch;
}

/** What the owner asked the phone to show, per project: one choice for every toggle. */
export const usePhoneChoice = create<{
  byProject: Record<string, 'live' | 'fixed'>;
  choose: (projectId: string, choice: 'live' | 'fixed') => void;
}>((set) => ({
  byProject: {},
  choose: (projectId, choice) =>
    set((s) => ({ byProject: { ...s.byProject, [projectId]: choice } })),
}));

/**
 * Whether "Fixed version" moves the emulator itself (Allen, Nov 2: off; the web imitation is the
 * "after" until the switch is reliable, DECISIONS "the fixed Android app on the emulator").
 */
const PHONE_SWITCH = false;

/** What the fixed side of a toggle shows right now. */
export type AfterState = 'live' | 'switching' | 'fixed' | 'imitation';

/**
 * The "after" side of a Before/After switch. On the web: the branch as a version (its own site
 * id). On Android (Allen, Nov 2): the emulator itself switches between the live app and the
 * fixed version, and the site view keeps showing the project's own screen; the web imitation
 * stands in only when the phone can't show it (no emulator, the dev client didn't reopen, the
 * agent is using it). `siteId` undefined means the project's own site view.
 */
export function useAfterView(
  run: RunState,
  name: string,
  branch: string | undefined,
  path?: string,
): {
  android: boolean;
  showAfter: boolean;
  choose: (choice: 'live' | 'fixed') => void;
  siteId: string | undefined;
  state: AfterState;
} {
  const { projectId, runId } = run;
  const status = useLiveSites((s) => s.sites[projectId]);
  const android = Boolean(status?.url?.startsWith('android:'));
  // One phone, one choice for every Android toggle; a web switch keeps its own.
  const shared = usePhoneChoice((s) => s.byProject[projectId]);
  const [own, setOwn] = useState<'live' | 'fixed'>();
  const choice = (android ? shared : own) ?? (branch ? 'fixed' : 'live');
  const showAfter = choice === 'fixed' && Boolean(branch);
  const fallback = android && showAfter && (!PHONE_SWITCH || Boolean(status?.phoneFallback));
  const versionId = useSiteVersion(
    projectId,
    runId,
    name,
    (!android || fallback) && showAfter && branch
      ? { kind: 'branch', branch, ...(path ? { path } : {}) }
      : null,
  );
  const want = PHONE_SWITCH && android && branch ? (showAfter ? branch : null) : undefined;
  useEffect(() => {
    if (want === undefined || getEngineKind() !== 'ipc') return;
    bridge().site?.phone(projectId, runId, want);
  }, [projectId, runId, want]);
  const choose = (next: 'live' | 'fixed') =>
    android ? usePhoneChoice.getState().choose(projectId, next) : setOwn(next);
  if (!android)
    return {
      android,
      showAfter,
      choose,
      siteId: showAfter ? versionId : undefined,
      state: showAfter ? 'fixed' : 'live',
    };
  const state: AfterState = !showAfter
    ? 'live'
    : fallback
      ? 'imitation'
      : status?.fixedBranch === branch
        ? 'fixed'
        : 'switching';
  return {
    android,
    showAfter,
    choose,
    siteId: state === 'imitation' ? versionId : undefined,
    state,
  };
}
