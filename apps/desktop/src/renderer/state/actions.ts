// UI actions that touch several stores. Every change to a run still goes through RunEngine.
import type { Mode, Project } from '@fitts/schema';
import { copy } from '../copy';
import { bridge } from '../lib/bridge';
import { getEngine, getReplayEngine, setReplaying } from './engine';
import { useProjects } from './projects';
import { useRunStore } from './run-store';
import { useSettings } from './settings';
import { useUi } from './ui';

const ACTIVE = new Set(['acting', 'redesigning', 'waiting-on-user']);

/** Another project's audit that is still going, if any (one run at a time, §6.9). */
export function otherRunningProject(projectId: string): string | null {
  const { runs } = useRunStore.getState();
  for (const [id, run] of Object.entries(runs)) {
    if (id !== projectId && run.phase === 'audit' && ACTIVE.has(run.activity)) return id;
  }
  return null;
}

/** "Start the audit": asks to pause another project's run first (SPEC §6.9). */
export function requestStartAudit(projectId: string): void {
  const running = otherRunningProject(projectId);
  if (running) {
    useUi.getState().set({ pauseConfirm: { runningProjectId: running, projectId } });
    return;
  }
  getEngine().startAudit(projectId);
}

export function confirmPauseAndStart(): void {
  const confirm = useUi.getState().pauseConfirm;
  if (!confirm) return;
  getEngine().pause(confirm.runningProjectId);
  getEngine().startAudit(confirm.projectId);
  useUi.getState().set({ pauseConfirm: null });
}

const modeBeforeDanger = new Map<string, Mode>();

/** Dangerous mode skips every permission for the current run (SPEC §6.13, §7.1). */
export function setDangerous(on: boolean): void {
  useSettings.getState().set({ dangerous: on });
  const projectId = useRunStore.getState().activeProjectId;
  const run = useRunStore.getState().runs[projectId];
  if (!run) return;
  if (on) {
    if (run.mode !== 'dangerous') modeBeforeDanger.set(projectId, run.mode);
    getEngine().setMode(projectId, 'dangerous');
  } else if (run.mode === 'dangerous') {
    getEngine().setMode(
      projectId,
      modeBeforeDanger.get(projectId) ?? useSettings.getState().defaultMode,
    );
    modeBeforeDanger.delete(projectId);
  }
}

/** Sets the default mode and, when not in Dangerous mode, the active run's mode. */
export function setPermissionMode(mode: Exclude<Mode, 'dangerous'>): void {
  useSettings.getState().set({ defaultMode: mode });
  const projectId = useRunStore.getState().activeProjectId;
  const run = useRunStore.getState().runs[projectId];
  if (run && run.mode !== 'dangerous' && run.phase !== 'done') getEngine().setMode(projectId, mode);
}

/** Adds a project (with a unique id) and opens its interview (SPEC §6.1, §6.11). */
export function addAndOpenProject(project: Project): void {
  const { projects, addProject } = useProjects.getState();
  const existing = projects.find((p) => p.id === project.id);
  let id = project.id;
  if (existing && existing.folder !== project.folder) {
    let n = 2;
    while (projects.some((p) => p.id === `${project.id}-${n}`)) n += 1;
    id = `${project.id}-${n}`;
  }
  if (!existing || id !== project.id) addProject({ ...project, id });
  useUi.getState().openProject(id);
}

export function removeProject(id: string): void {
  useProjects.getState().removeProject(id);
  const { lastOpenId, projects } = useProjects.getState();
  if (useRunStore.getState().activeProjectId !== id) return;
  if (lastOpenId && projects.length > 0) {
    useUi.getState().openProject(lastOpenId);
    useUi.getState().openSettings('projects');
  }
}

/**
 * Sends the message box (SPEC §6.3, §7.2, §7.5). During the interview answers fill the
 * brief. Spoken messages starting with "Fitts" are commands: "Fitts, stop" stops the
 * current action and any other "Fitts, …" interrupts. "stop" or "wait" alone does nothing.
 */
export function sendFromComposer(projectId: string, text: string, { spoken = false } = {}): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const engine = getEngine();
  const ui = useUi.getState();
  const pointingAt = ui.draftPointingAt ?? undefined;
  ui.set({ draft: '', draftPointingAt: null });
  const run = useRunStore.getState().runs[projectId];

  if (run?.phase === 'interview' && !pointingAt) {
    if (spoken) engine.sendMessage(projectId, trimmed, { spoken });
    else engine.answerInterview(projectId, trimmed);
    return;
  }
  const command = spoken && isFittsCommand(trimmed);
  if (command && /^fitts\b[,\s]*stop\b/i.test(trimmed)) {
    engine.sendMessage(projectId, trimmed, { spoken });
    engine.stopAction(projectId);
    return;
  }
  engine.sendMessage(projectId, trimmed, {
    ...(pointingAt ? { pointingAt } : {}),
    ...(spoken ? { spoken } : {}),
  });
  if (command) engine.interruptNow(projectId);
}

/** A voice command needs "Fitts" first: "Fitts, stop" counts, "stop" alone does not (§7.5). */
export const isFittsCommand = (text: string) => /^fitts\b/i.test(text.trim());

/** Welcome's "Watch a recorded run" (SPEC-phase2 §12.3): no keys, no site, no agent. */
export async function openReplay(): Promise<boolean> {
  const opened = await bridge().replay?.open();
  if (!opened) return false;
  const last = [...opened.events].reverse().find((e) => e.event.type === 'run.started');
  const brief = last?.event.type === 'run.started' ? last.event.state.brief : {};
  const projects = useProjects.getState();
  const project: Project = {
    id: opened.projectId,
    name: copy.replay.projectName,
    kind: 'live',
    url: copy.replay.url,
    brief,
    createdAt: new Date().toISOString(),
    replay: { runId: opened.runId },
  };
  if (!projects.projects.some((p) => p.id === project.id)) projects.addProject(project);
  setReplaying(true);
  getReplayEngine().play(opened.projectId, opened.events, 4);
  useUi.getState().openProject(opened.projectId);
  return true;
}
