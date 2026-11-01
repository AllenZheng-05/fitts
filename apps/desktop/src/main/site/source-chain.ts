// The component chain behind an element (SPEC-phase4 §2.2), read in the page's *main* world
// (isolated worlds can't see React's expando properties). Everything that comes back is page
// data: a hint for the fixer, which re-reads the file before using it, never an instruction.
import type { SourceFrame } from '@fitts/schema';

/** At most this many frames, nearest first. */
export const MAX_FRAMES = 8;

/**
 * Runs in the main world with one argument, a CSS selector for the element. Returns, nearest
 * first: the host element's own `data-fitts-src` (`host`); for each React function or class
 * component up the fiber tree, its name and its call-site stamp (`call`), or without the
 * plugin the first non-library frame of React 19's `_debugStack` (`debug`); Svelte 5's
 * `__svelte_meta.loc`; Vue 3's `__vueParentComponent.type.__file`.
 */
export const SOURCE_CHAIN_FN = `function (selector) {
  const MAX = ${MAX_FRAMES};
  const out = [];
  const push = (f) => { if (out.length < MAX) out.push(f); };
  const node = document.querySelector(selector);
  if (!node) return out;
  const own = node.getAttribute && node.getAttribute('data-fitts-src');
  if (own) push({ kind: 'host', src: String(own).slice(0, 300) });
  const nameOf = (t) => {
    if (typeof t === 'function') return t.displayName || t.name || '';
    if (t && typeof t === 'object') {
      const inner = t.render || t.type;
      if (typeof inner === 'function') return inner.displayName || inner.name || '';
      if (typeof t.displayName === 'string') return t.displayName;
    }
    return '';
  };
  const debugFrame = (fiber) => {
    const err = fiber._debugStack;
    const stack = err && typeof err.stack === 'string' ? err.stack : typeof err === 'string' ? err : '';
    if (!stack) return undefined;
    for (const line of stack.split('\\n')) {
      const m = /(https?:\\/\\/[^\\s)]+?):(\\d+):(\\d+)\\)?\\s*$/.exec(line);
      if (!m) continue;
      const url = m[1];
      if (/node_modules|react-dom|\\/react\\/|jsx-dev-runtime|jsx-runtime|\\/@vite\\/|\\/@react-refresh/.test(url)) continue;
      return url + ':' + m[2] + ':' + m[3];
    }
    return undefined;
  };
  const key = Object.keys(node).find((k) => k.startsWith('__reactFiber$'));
  if (key) {
    let fiber = node[key];
    for (let hops = 0; fiber && hops < 1000 && out.length < MAX; hops++, fiber = fiber.return) {
      const t = fiber.type;
      const component = typeof t === 'function' || (t && typeof t === 'object' && t.$$typeof);
      if (!component) continue;
      const name = String(nameOf(t) || '').slice(0, 80);
      const props = fiber.memoizedProps || {};
      const src = typeof props['data-fitts-src'] === 'string' ? props['data-fitts-src'].slice(0, 300) : undefined;
      const debug = src ? undefined : debugFrame(fiber);
      if (!name && !src && !debug) continue;
      const frame = { kind: src ? 'call' : 'debug' };
      if (name) frame.component = name;
      if (src || debug) frame.src = src || debug;
      push(frame);
    }
    return out;
  }
  const svelte = node.__svelte_meta && node.__svelte_meta.loc;
  if (svelte && svelte.file) {
    push({ kind: 'host', src: String(svelte.file) + ':' + (svelte.line || 0) + ':' + (svelte.column || 0) });
    return out;
  }
  const vue = node.__vueParentComponent;
  if (vue && vue.type) {
    const frame = { kind: 'call' };
    if (vue.type.name || vue.type.__name) frame.component = String(vue.type.name || vue.type.__name).slice(0, 80);
    if (vue.type.__file) frame.src = String(vue.type.__file).slice(0, 300);
    if (frame.component || frame.src) push(frame);
  }
  return out;
}`;

/** The selector for a crawler ref (its own data-ref/data-testid, or the one Fitts gave it). */
export function selectorFor(ref: string): string {
  const q = JSON.stringify(ref);
  return `[data-ref=${q}],[data-testid=${q}],[data-fitts-ref=${q}]`;
}

/** Keeps only well-shaped frames (the page could return anything). */
export function cleanFrames(raw: unknown): SourceFrame[] {
  if (!Array.isArray(raw)) return [];
  const out: SourceFrame[] = [];
  for (const f of raw.slice(0, MAX_FRAMES) as Partial<SourceFrame>[]) {
    if (!f || (f.kind !== 'host' && f.kind !== 'call' && f.kind !== 'debug')) continue;
    const frame: SourceFrame = { kind: f.kind };
    if (typeof f.component === 'string' && f.component) frame.component = f.component.slice(0, 80);
    if (typeof f.src === 'string' && f.src) frame.src = f.src.slice(0, 300);
    if (frame.component || frame.src) out.push(frame);
  }
  return out;
}

/**
 * A debug frame's URL ("http://localhost:5173/src/pages/Compose.tsx?t=1:118:9", or Vite's
 * "/@fs/C:/code/site/src/App.tsx:3:1") as a project path, best effort: the path after the dev
 * server's origin, or the part under the project folder.
 */
export function mapDebugSrc(src: string, origin: string, folder?: string): string {
  const m = /^(.*?):(\d+):(\d+)$/.exec(src);
  if (!m) return src;
  const [, url, line, col] = m;
  let path = url ?? '';
  try {
    const u = new URL(path);
    if (u.origin !== origin) return src;
    path = decodeURIComponent(u.pathname);
  } catch {
    return src;
  }
  if (path.startsWith('/@fs/')) path = path.slice('/@fs/'.length);
  else path = path.replace(/^\/+/, '');
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  if (folder) {
    const base = norm(folder).replace(/^\/+/, '');
    const rel = norm(path).replace(/^\/+/, '');
    if (rel.toLowerCase().startsWith(base.toLowerCase() + '/')) path = rel.slice(base.length + 1);
  }
  return `${path}:${line}:${col}`;
}
