// @fitts/vite-plugin (SPEC-phase2 §3.3): in `vite serve` only, stamps
// data-fitts-src="relative/path.tsx:line:col" on every host JSX element (lowercase tag), so
// Fitts can go from an element on the page straight to the line that renders it.
import { parse } from '@babel/parser';
import MagicString from 'magic-string';
import { relative } from 'node:path';
import type { Plugin } from 'vite';

export const ATTR = 'data-fitts-src';

interface Node {
  type: string;
  start?: number | null;
  end?: number | null;
  loc?: { start: { line: number; column: number } } | null;
  [key: string]: unknown;
}

/** Host elements only: `div`, `button`, not `Button` or `motion.div`. */
function isHostTag(name: Node): boolean {
  return name.type === 'JSXIdentifier' && /^[a-z]/.test(String(name['name']));
}

function hasAttr(attrs: Node[]): boolean {
  return attrs.some(
    (a) =>
      a.type === 'JSXAttribute' &&
      (a['name'] as Node | undefined)?.type === 'JSXIdentifier' &&
      (a['name'] as Node)['name'] === ATTR,
  );
}

function walk(node: unknown, visit: (n: Node) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  const n = node as Node;
  if (typeof n.type === 'string') visit(n);
  for (const key of Object.keys(n)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue;
    const value = n[key];
    if (value && typeof value === 'object') walk(value, visit);
  }
}

/**
 * Adds the source stamp to `code` (a .jsx/.tsx module at `file`). Returns null when there is
 * nothing to stamp, so Vite keeps the original module.
 */
export function stampSource(
  code: string,
  file: string,
  root: string,
): { code: string; map: ReturnType<MagicString['generateMap']> } | null {
  if (!code.includes('<')) return null;
  let ast: unknown;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: file.endsWith('.tsx') || file.endsWith('.ts') ? ['jsx', 'typescript'] : ['jsx'],
      errorRecovery: true,
    });
  } catch {
    return null;
  }
  const rel = relative(root, file).split('\\').join('/');
  const s = new MagicString(code);
  let changed = false;
  walk(ast, (n) => {
    if (n.type !== 'JSXOpeningElement') return;
    const name = n['name'] as Node;
    if (!isHostTag(name) || hasAttr((n['attributes'] as Node[]) ?? [])) return;
    if (name.end == null || !n.loc) return;
    const { line, column } = n.loc.start;
    s.appendLeft(name.end, ` ${ATTR}="${rel}:${line}:${column + 1}"`);
    changed = true;
  });
  if (!changed) return null;
  return { code: s.toString(), map: s.generateMap({ hires: true, source: file }) };
}

/** The plugin. Runs before @vitejs/plugin-react; never runs in `vite build`. */
export default function fittsSource(): Plugin {
  let root = process.cwd();
  return {
    name: 'fitts-source',
    enforce: 'pre',
    apply: 'serve',
    configResolved(config) {
      root = config.root;
    },
    transform(code, id) {
      const file = id.split('?')[0] ?? id;
      if (!/\.[jt]sx$/.test(file) || file.includes('/node_modules/')) return null;
      return stampSource(code, file, root);
    },
  };
}
