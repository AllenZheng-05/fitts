// Understand, end to end in the agent process (SPEC-phase4 §3.2): Pass 1 over the folder, the
// repo map and route files, then Pass 2 (a model call) unless main's cache for this commit was
// built from the same route files, then validation and the owner's corrections. Main caches
// the result; nothing is written into the user's repo.
import type { AppModel, AppModelPatch } from '@fitts/schema';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { extract } from '../../main/understand/extract';
import { readJson, readText } from '../../main/understand/files';
import { renderRepoMap, repoMap } from '../../main/understand/repomap';
import type { UnderstandAsk } from '../protocol';
import type { CallContext, LlmCaller } from '../llm/call';
import { applyPatches, understand, validate, type UnderstandInput } from './understand';

export interface Built {
  model: AppModel;
  hashes: Record<string, string>;
  modeled: boolean;
  /** Built now (main should cache it), not taken from the cache. */
  fresh: boolean;
}

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

export async function buildModel(
  ask: UnderstandAsk,
  llm: { online: boolean; caller: LlmCaller; ctx: CallContext; model: string } | undefined,
  signal?: AbortSignal,
): Promise<Built> {
  const { folder, projectId, commit, cached, patches } = ask;
  const extracted = extract(folder);
  const routeFiles = extracted.routeFiles
    .filter((r, i, all) => all.findIndex((x) => x.file === r.file) === i)
    .map((r) => ({ ...r, code: readText(folder, r.file, 60_000) }));
  const hashes = Object.fromEntries(routeFiles.map((r) => [r.file, sha1(r.code)]));
  const sameFiles =
    cached !== undefined &&
    Object.keys(hashes).length === Object.keys(cached.hashes).length &&
    Object.entries(hashes).every(([f, h]) => cached.hashes[f] === h);
  const online = Boolean(llm?.online);
  // The cache stands when the route files haven't changed, and it wasn't an offline reading
  // that a model could now improve.
  if (cached && sameFiles && (cached.modeled || !online)) {
    const model = applyPatches({ ...cached.model, commit }, patches);
    return { model, hashes, modeled: cached.modeled, fresh: false };
  }
  const readme =
    ['README.md', 'readme.md', 'README', 'README.mdx']
      .map((f) => readText(folder, f, 20_000))
      .find(Boolean) ?? '';
  const pkg =
    readJson<{ name?: string; dependencies?: Record<string, string> }>(folder, 'package.json') ??
    {};
  const input: UnderstandInput = {
    extracted,
    readme,
    pkg: {
      ...(pkg.name ? { name: pkg.name } : {}),
      ...(pkg.dependencies ? { dependencies: pkg.dependencies } : {}),
    },
    repoMap: renderRepoMap(repoMap(folder, extracted.files)),
    routeFiles,
  };
  const raw = llm?.online ? await understand(llm.caller, llm.ctx, llm.model, input, signal) : null;
  const v = validate(extracted, raw, (file) => existsSync(join(folder, file)));
  const model: AppModel = applyPatches(
    {
      version: 1,
      projectId,
      commit,
      kind: extracted.kind,
      stack: extracted.stack,
      summary: v.summary,
      pages: v.pages,
      journeys: v.journeys,
      tokens: extracted.tokens,
      apis: extracted.apis,
      breakpoints: extracted.breakpoints,
      media: extracted.media,
      sensitive: extracted.sensitive,
      notes: v.notes,
    },
    patches,
  );
  return { model, hashes, modeled: v.modeled, fresh: true };
}

/** The journeys the owner unchecked on the card: disabled, and named in the brief's outOfScope. */
export function applyUnchecked(model: AppModel, ids: string[]): AppModel {
  const off = new Set(ids);
  return {
    ...model,
    journeys: model.journeys.map((j) =>
      off.has(j.id) ? { ...j, enabled: false } : { ...j, enabled: true },
    ),
  };
}

export { applyPatches };
export type { AppModelPatch };
