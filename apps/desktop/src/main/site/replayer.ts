// The replayer (SPEC-phase4 §5.2): a second hidden window on the same dev server and session
// as the project's site (so logins carry), used to re-run a finding's steps and check its
// oracle, without touching the live view. No frames are streamed; destructive writes are held
// exactly as in the main window (and never released: the replayer has no gate to ask); it's
// destroyed after the job.
import { PAGE_PROBES } from '@fitts/probes';
import type { DeviceCell, SiteDevice } from '@fitts/schema';
import type { OpTrace, ReplayAnswer, ReplayAsk, ReplayStep } from '../../agent/protocol';
import { SiteWindow } from './site-window';

export type {
  ReplayAsk as ReplayRequest,
  ReplayAnswer as ReplayResult,
} from '../../agent/protocol';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** The ref of a step's element on the page as it is now. */
async function resolveRef(win: SiteWindow, step: ReplayStep): Promise<string | undefined> {
  const snap = await win.snapshot();
  if (step.ref && snap.nodes.some((n) => n.ref === step.ref)) return step.ref;
  const t = step.target;
  if (!t) return undefined;
  if (t.testId && snap.nodes.some((n) => n.ref === t.testId)) return t.testId;
  const name = norm(t.name);
  const byBoth = snap.nodes.find((n) => n.role === t.role && norm(n.name) === name);
  if (byBoth) return byBoth.ref;
  const byName = snap.nodes.find((n) => norm(n.name) === name);
  return byName?.ref;
}

export async function replay(
  projectId: string,
  baseUrl: string,
  device: SiteDevice | DeviceCell | null,
  req: ReplayAsk,
): Promise<ReplayAnswer> {
  const win = new SiteWindow(
    projectId,
    baseUrl,
    () => undefined,
    () => undefined,
  );
  win.setActive(false);
  const traces: (OpTrace | null)[] = [];
  const missing: number[] = [];
  try {
    if (device) await win.emulate(device).catch(() => undefined);
    await win.load(req.start.path).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 900));
    for (const [i, step] of req.steps.entries()) {
      if (step.kind === 'navigate') {
        await win.goto(step.path ?? req.start.path).catch(() => undefined);
        traces.push(null);
        continue;
      }
      if (step.kind === 'back') {
        await win.back();
        traces.push(null);
        continue;
      }
      if (step.kind === 'key') {
        await win.press(step.text ?? 'Enter');
        traces.push(null);
        continue;
      }
      const ref = await resolveRef(win, step);
      if (!ref) {
        missing.push(i);
        traces.push(null);
        continue;
      }
      const r =
        step.kind === 'type'
          ? await win.type(ref, step.text ?? 'fitts-test message')
          : await win.click(ref, false);
      traces.push(r.trace ?? null);
    }
    await new Promise((r) => setTimeout(r, 500));
    const results = await win.runProbes(req.probes ?? PAGE_PROBES).catch(() => []);
    const focus = req.focus ? await win.focusSweep().catch(() => []) : [];
    const viewport = req.viewport ? await win.viewportSweep().catch(() => []) : [];
    const snapshot = await win.snapshot().catch(() => undefined);
    const value = req.fieldValueOf
      ? await win.value(req.fieldValueOf).catch(() => null)
      : undefined;
    const path = snapshot?.path ?? req.start.path;
    return {
      ok: true,
      path,
      results,
      focus,
      viewport,
      traces,
      missing,
      ...(snapshot ? { snapshot } : {}),
      ...(value !== undefined ? { value } : {}),
    };
  } catch (e) {
    return {
      ok: false,
      error: (e as Error).message,
      path: req.start.path,
      results: [],
      focus: [],
      viewport: [],
      traces,
      missing,
    };
  } finally {
    win.destroy();
  }
}
