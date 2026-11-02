// The edit allowlist (SPEC-phase4 §7.3): a guarantee, enforced in main where the fixer's patches
// land, never in a prompt. A fix may change its finding's files (the source chain, the route's
// file and layout, the style and token files they import), global CSS and the app's own
// component files; anything else needs `request_scope`. Sensitive files (lockfiles, .env, CI,
// middleware, auth and API handlers, package.json) need the owner's own "Go ahead" in every
// mode, and Plan only never changes anything. Pure: the fix host supplies the facts.

export type FixMode = 'plan' | 'ask-every' | 'ask-unsure' | 'autonomous' | 'dangerous';

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');

/** Files a fix never touches without the owner's answer. */
const SENSITIVE: RegExp[] = [
  /(^|\/)package\.json$/,
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|npm-shrinkwrap\.json)$/,
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.github\//,
  /(^|\/)(\.gitlab-ci\.yml|azure-pipelines\.yml|\.circleci\/|Jenkinsfile|\.travis\.yml)/,
  /(^|\/)middleware\.(t|j)sx?$/,
  /(^|\/)(auth|authentication|session)(\/|\.|-)/i,
  /(^|\/)(pages\/api|app\/api|src\/api|server|api)\//,
  /(^|\/)(vite|next|webpack|rollup|tsconfig|babel|eslint)\.config\.|(^|\/)tsconfig.*\.json$/,
  /(^|\/)(Dockerfile|docker-compose\.ya?ml)$/,
];

export const isSensitive = (path: string): boolean => SENSITIVE.some((r) => r.test(norm(path)));

/** The app's own UI files: components, pages, styles, under src/ (or app/, pages/, components/). */
const UI_FILE =
  /^(src|app|pages|components|styles)\/.*\.(tsx|jsx|ts|js|vue|svelte|css|scss|sass|less|module\.css)$/;
const GLOBAL_CSS =
  /(^|\/)(global|globals|index|app|main|styles?|theme|tokens)\.(css|scss|sass|less)$/;

export interface Scope {
  /** The finding's own files (chain, route file, layout, imported styles and tokens). */
  defaults: Set<string>;
  /** Files the owner (or the mode) allowed through request_scope. */
  granted: Set<string>;
}

export const newScope = (files: string[] = []): Scope => ({
  // Sensitive files never come in as defaults, whoever asks.
  defaults: new Set(files.map(norm).filter((f) => !isSensitive(f))),
  granted: new Set(),
});

export type Verdict = { ok: true } | { ok: false; error: string };

/** May a patch or write change `path`? The refusal says what the model can do instead. */
export function mayEdit(path: string, scope: Scope, mode: FixMode): Verdict {
  const p = norm(path);
  if (mode === 'plan') return { ok: false, error: 'Plan only: nothing may be changed.' };
  if (scope.granted.has(p)) return { ok: true };
  if (isSensitive(p))
    return {
      ok: false,
      error: `${p} is a sensitive file (dependencies, config, auth, API or CI). Call request_scope("${p}", why) to ask the owner; it changes only with their "Go ahead".`,
    };
  if (scope.defaults.has(p) || UI_FILE.test(p) || GLOBAL_CSS.test(p)) return { ok: true };
  return {
    ok: false,
    error: `${p} is outside the files this fix may change (the finding's components, its page, their styles and the app's own UI files). Call request_scope("${p}", why) if you really need it.`,
  };
}

/** What a request_scope needs before the file is granted. */
export function scopeNeeds(path: string, mode: FixMode): 'refuse' | 'owner' | 'grant' {
  if (mode === 'plan') return 'refuse';
  if (isSensitive(path)) return 'owner';
  return mode === 'autonomous' || mode === 'dangerous' ? 'grant' : 'owner';
}

/**
 * Grants a file when what it needs is there: in Autonomous and Dangerous a non-sensitive file is
 * granted outright; otherwise only with the owner's own answer to a question that names it.
 */
export function grant(
  path: string,
  scope: Scope,
  mode: FixMode,
  owner?: { question: string; answer: string; yes: string },
): Verdict {
  const p = norm(path);
  const needs = scopeNeeds(p, mode);
  if (needs === 'refuse') return { ok: false, error: 'Plan only: nothing may be changed.' };
  if (needs === 'owner') {
    if (!owner || owner.answer !== owner.yes || !owner.question.includes(p))
      return { ok: false, error: `${p} needs the owner's "Go ahead" on a question that names it.` };
  }
  scope.granted.add(p);
  return { ok: true };
}
