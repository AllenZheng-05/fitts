// Pass 2 of the App Model (SPEC-phase4 §3.2): one structured call on Spark that writes the
// summary, each page's features, the journeys, titles and notes over what Pass 1 extracted;
// then deterministic validation, so nothing the model invented survives. Without a model
// (offline, no key) the model is Pass 1 alone with a plain summary and journeys from its forms.
import type { AppModel, AppModelPatch, AppModelSummary, Journey } from '@fitts/schema';
import prompt from '../../../../../docs/prompts/understand.md?raw';
import patchPrompt from '../../../../../docs/prompts/understand-patch.md?raw';
import type { CallContext, LlmCaller } from '../llm/call';
import type { Extracted } from '../../main/understand/extract';

/** Over this many input tokens, only the repo map and the route files go (§3.2). */
export const TOKEN_CAP = 250_000;
/** Each route file's code is capped at this many characters. */
export const ROUTE_FILE_CHARS = 16_000;
export const README_CHARS = 6_000;

export interface UnderstandInput {
  extracted: Extracted;
  readme: string;
  pkg: { name?: string; dependencies?: Record<string, string> };
  repoMap: string;
  routeFiles: { route: string; file: string; code: string }[];
}

const tokens = (s: string) => Math.ceil(s.length / 4);

const JOURNEY_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    goal: { type: 'string' },
    start: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    pages: { type: 'array', items: { type: 'string' } },
    priority: { type: 'integer' },
    needs: {
      type: 'array',
      items: { type: 'string', enum: ['login', 'data', 'payment', 'email'] },
    },
  },
  required: ['id', 'name', 'goal', 'start', 'steps', 'pages', 'priority', 'needs'],
  additionalProperties: false,
};

export const UNDERSTAND_FORMAT = {
  type: 'json_schema',
  name: 'app_model',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            route: { type: 'string' },
            title: { type: 'string' },
            features: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  files: { type: 'array', items: { type: 'string' } },
                },
                required: ['id', 'name', 'description', 'files'],
                additionalProperties: false,
              },
            },
          },
          required: ['route', 'title', 'features'],
          additionalProperties: false,
        },
      },
      journeys: { type: 'array', items: JOURNEY_SCHEMA },
      notes: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'pages', 'journeys', 'notes'],
    additionalProperties: false,
  },
};

/** The user turn: Pass 1's data, the README, the map and the route files, under the cap. */
export function understandInput(input: UnderstandInput): string {
  const extracted = JSON.stringify({ ...input.extracted, files: undefined, routeFiles: undefined });
  const files = input.routeFiles.map(
    (r) => `--- ${r.route} · ${r.file} ---\n${r.code.slice(0, ROUTE_FILE_CHARS)}`,
  );
  const full = [
    `extracted: ${extracted}`,
    `package: ${JSON.stringify(input.pkg)}`,
    `readme: ${input.readme.slice(0, README_CHARS)}`,
    `repoMap:\n${input.repoMap}`,
    `routeFiles:\n${files.join('\n')}`,
  ].join('\n\n');
  const body =
    tokens(full) <= TOKEN_CAP
      ? full
      : [
          `extracted: ${extracted}`,
          `repoMap:\n${input.repoMap}`,
          `routeFiles:\n${files.join('\n')}`,
        ].join('\n\n');
  return `<untrusted_project_data>\n${body}\n</untrusted_project_data>`;
}

interface ModelOut {
  summary?: unknown;
  pages?: unknown;
  journeys?: unknown;
  notes?: unknown;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'journey';

const text = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Deterministic validation (§3.2): features whose files don't exist are dropped; pages the
 * model invented are dropped; journeys may only name known routes; every page with a form has
 * a journey. Anything dropped goes into `notes`.
 */
export function validate(
  extracted: Extracted,
  raw: ModelOut | null,
  exists: (file: string) => boolean,
): Pick<AppModel, 'summary' | 'pages' | 'journeys' | 'notes'> & { modeled: boolean } {
  const known = new Map(extracted.pages.map((p) => [p.route, p]));
  const notes = [...extracted.notes];
  const dropped = (what: string) => notes.push(`I couldn’t confirm ${what}, so I left it out.`);
  const pages = extracted.pages.map((p) => ({
    ...p,
    features: [] as AppModel['pages'][number]['features'],
  }));
  const byRoute = new Map(pages.map((p) => [p.route, p]));
  if (raw && Array.isArray(raw.pages))
    for (const page of raw.pages as { route?: unknown; title?: unknown; features?: unknown }[]) {
      const route = text(page.route, 200);
      const target = byRoute.get(route);
      if (!target) {
        if (route) dropped(`a page at ${route}`);
        continue;
      }
      const title = text(page.title, 60);
      if (title) target.title = title;
      const seen = new Set<string>();
      for (const f of (Array.isArray(page.features) ? page.features : []) as Record<
        string,
        unknown
      >[]) {
        const files = (Array.isArray(f['files']) ? f['files'] : [])
          .map((x) => text(x, 300))
          .filter((x) => x && exists(x));
        const name = text(f['name'], 80);
        if (!name) continue;
        if (files.length === 0 && Array.isArray(f['files']) && f['files'].length > 0) {
          dropped(`the files behind “${name}” on ${route}`);
          continue;
        }
        const id = slug(text(f['id'], 48) || name);
        if (seen.has(id)) continue;
        seen.add(id);
        target.features.push({
          id,
          name,
          description: text(f['description'], 300),
          files: files.length ? files : target.file ? [target.file] : [],
        });
      }
    }
  const journeys: Journey[] = [];
  const ids = new Set<string>();
  if (raw && Array.isArray(raw.journeys))
    for (const j of raw.journeys as Record<string, unknown>[]) {
      const name = text(j['name'], 80);
      const start = text(j['start'], 200);
      if (!name) continue;
      if (!known.has(start)) {
        dropped(`where “${name}” starts (${start || 'no route'})`);
        continue;
      }
      const routes = (Array.isArray(j['pages']) ? j['pages'] : [])
        .map((x) => text(x, 200))
        .filter((r) => known.has(r));
      const steps = (Array.isArray(j['steps']) ? j['steps'] : [])
        .map((x) => text(x, 200))
        .filter(Boolean)
        .slice(0, 10);
      if (steps.length < 2) {
        dropped(`the steps of “${name}”`);
        continue;
      }
      const pr = Number(j['priority']);
      const needs = (Array.isArray(j['needs']) ? j['needs'] : []).filter(
        (n): n is Journey['needs'] extends (infer U)[] | undefined ? U : never =>
          ['login', 'data', 'payment', 'email'].includes(String(n)),
      );
      let id = slug(text(j['id'], 48) || name);
      for (let n = 2; ids.has(id); n++) id = `${slug(text(j['id'], 48) || name)}-${n}`;
      ids.add(id);
      journeys.push({
        id,
        name,
        goal: text(j['goal'], 200),
        start,
        steps,
        pages: routes.length ? routes : [start],
        priority: pr === 1 || pr === 2 || pr === 3 ? pr : 2,
        ...(needs.length ? { needs } : {}),
        source: 'code',
      });
    }
  // Every page with a form has a journey through it.
  for (const p of pages)
    for (const form of p.forms) {
      if (journeys.some((j) => j.pages.includes(p.route) || j.start === p.route)) continue;
      const id = `fill-${slug(form.name)}-${slug(p.route) || 'home'}`;
      if (ids.has(id)) continue;
      ids.add(id);
      journeys.push({
        id,
        name: `Fill in the ${form.name === 'form' ? '' : form.name + ' '}form on ${p.route}`.replace(
          /\s+/g,
          ' ',
        ),
        goal: 'The form is submitted and the page says so',
        start: p.route,
        steps: [...form.fields.slice(0, 8).map((f) => `Type in ${f.name}`), `Submit the form`],
        pages: [p.route],
        priority: 2,
        source: 'code',
      });
    }
  const summary = text(raw?.summary, 1200) || plainSummary(extracted);
  for (const n of Array.isArray(raw?.notes) ? raw.notes : []) {
    const t = text(n, 200);
    if (t) notes.push(t);
  }
  return {
    summary,
    pages,
    journeys: journeys.slice(0, 12),
    notes: notes.slice(0, 20),
    modeled: Boolean(raw),
  };
}

/** Pass 1 alone, in a sentence or two. */
export function plainSummary(x: Extracted): string {
  const n = x.pages.length;
  const routes = x.pages
    .map((p) => p.route)
    .slice(0, 8)
    .join(', ');
  const forms = x.pages.reduce((s, p) => s + p.forms.length, 0);
  return `${x.name ? `${x.name} is a` : 'A'} ${x.stack.framework} app with ${n} ${n === 1 ? 'page' : 'pages'}${n ? ` (${routes}${x.pages.length > 8 ? ', …' : ''})` : ''}${forms ? `, ${forms} ${forms === 1 ? 'form' : 'forms'}` : ''}${x.apis.length ? ` and ${x.apis.length} API ${x.apis.length === 1 ? 'call' : 'calls'}` : ''}. I read the code without a model, so the features and journeys are what the forms and routes say.`;
}

/** Pass 2: one structured call; null when it fails (the caller falls back to Pass 1). */
export async function understand(
  caller: LlmCaller,
  ctx: CallContext,
  model: string,
  input: UnderstandInput,
  signal?: AbortSignal,
): Promise<ModelOut | null> {
  try {
    const res = await caller.call(ctx, {
      task: 'understand',
      model,
      instructions: prompt,
      input: understandInput(input),
      format: UNDERSTAND_FORMAT,
      reasoning: { effort: 'medium' },
      maxOutputTokens: 12_000,
      fixture: 'understand',
      ...(signal ? { signal } : {}),
    });
    return JSON.parse(res.outputText) as ModelOut;
  } catch {
    return null;
  }
}

/** Applies the owner's corrections (§3.3), newest last; they survive cache refreshes. */
export function applyPatches(model: AppModel, patches: AppModelPatch[]): AppModel {
  let journeys = [...model.journeys];
  const pages = model.pages.map((p) => ({ ...p }));
  for (const p of patches) {
    if (p.op === 'addJourney') {
      journeys = journeys.filter((j) => j.id !== p.journey.id);
      journeys.push({ ...p.journey, source: 'owner' });
    } else if (p.op === 'dropJourney') journeys = journeys.filter((j) => j.id !== p.id);
    else if (p.op === 'priority')
      journeys = journeys.map((j) =>
        j.id === p.id ? { ...j, priority: p.priority, source: 'owner' } : j,
      );
    else if (p.op === 'outOfScope')
      journeys = journeys.map((j) =>
        p.routes.includes(j.start) || j.pages.every((r) => p.routes.includes(r))
          ? { ...j, enabled: false }
          : j,
      );
  }
  return { ...model, pages, journeys };
}

export const PATCH_FORMAT = {
  type: 'json_schema',
  name: 'app_model_patch',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      addJourney: { type: 'array', items: JOURNEY_SCHEMA },
      dropJourney: { type: 'array', items: { type: 'string' } },
      priority: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' }, priority: { type: 'integer' } },
          required: ['id', 'priority'],
          additionalProperties: false,
        },
      },
      outOfScope: { type: 'array', items: { type: 'string' } },
      say: { type: 'string' },
    },
    required: ['addJourney', 'dropJourney', 'priority', 'outOfScope', 'say'],
    additionalProperties: false,
  },
};

/** The owner's message about the map → patches, and a line back (§3.3). */
export async function patchFromMessage(
  caller: LlmCaller,
  ctx: CallContext,
  model: string,
  app: AppModel,
  message: string,
  signal?: AbortSignal,
): Promise<{ patches: AppModelPatch[]; say: string }> {
  const res = await caller.call(ctx, {
    task: 'understand',
    model,
    instructions: patchPrompt,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `<app_model>${JSON.stringify({ summary: app.summary, pages: app.pages.map((p) => ({ route: p.route, title: p.title })), journeys: app.journeys.map((j) => ({ id: j.id, name: j.name, priority: j.priority, pages: j.pages })) })}</app_model>\n<owner_message>${message.slice(0, 2000)}</owner_message>`,
          },
        ],
      },
    ],
    format: PATCH_FORMAT,
    reasoning: { effort: 'minimal' },
    fixture: 'understand-patch',
    ...(signal ? { signal } : {}),
  });
  const raw = JSON.parse(res.outputText) as Record<string, unknown>;
  const known = new Set(app.pages.map((p) => p.route));
  const ids = new Set(app.journeys.map((j) => j.id));
  const patches: AppModelPatch[] = [];
  for (const j of (Array.isArray(raw['addJourney']) ? raw['addJourney'] : []) as Record<
    string,
    unknown
  >[]) {
    const name = text(j['name'], 80);
    const start = text(j['start'], 200);
    if (!name || !known.has(start)) continue;
    const steps = (Array.isArray(j['steps']) ? j['steps'] : [])
      .map((x) => text(x, 200))
      .filter(Boolean)
      .slice(0, 10);
    const pr = Number(j['priority']);
    patches.push({
      op: 'addJourney',
      journey: {
        id: slug(text(j['id'], 48) || name),
        name,
        goal: text(j['goal'], 200),
        start,
        steps: steps.length >= 2 ? steps : [`Open ${start}`, name],
        pages: (Array.isArray(j['pages']) ? j['pages'] : [])
          .map((x) => text(x, 200))
          .filter((r) => known.has(r)),
        priority: pr === 1 || pr === 2 || pr === 3 ? pr : 2,
        source: 'owner',
      },
    });
  }
  for (const id of (Array.isArray(raw['dropJourney']) ? raw['dropJourney'] : []) as unknown[])
    if (ids.has(String(id))) patches.push({ op: 'dropJourney', id: String(id) });
  for (const p of (Array.isArray(raw['priority']) ? raw['priority'] : []) as Record<
    string,
    unknown
  >[]) {
    const pr = Number(p['priority']);
    if (ids.has(String(p['id'])) && (pr === 1 || pr === 2 || pr === 3))
      patches.push({ op: 'priority', id: String(p['id']), priority: pr });
  }
  const routes = (Array.isArray(raw['outOfScope']) ? raw['outOfScope'] : [])
    .map((x) => text(x, 200))
    .filter((r) => known.has(r));
  if (routes.length) patches.push({ op: 'outOfScope', routes });
  return { patches, say: text(raw['say'], 240) };
}

/** What the UI needs of a model (`RunState.appModel`). */
export function summaryOf(model: AppModel, modeled: boolean): AppModelSummary {
  return {
    summary: model.summary,
    commit: model.commit,
    pages: model.pages.map((p) => ({
      route: p.route,
      ...(p.title ? { title: p.title } : {}),
      ...(p.file ? { file: p.file } : {}),
      source: p.source,
      ...(p.gate ? { gate: p.gate } : {}),
      features: p.features.map(({ id, name, description }) => ({ id, name, description })),
      forms: p.forms.length,
    })),
    journeys: model.journeys,
    notes: model.notes,
    modeled,
  };
}
