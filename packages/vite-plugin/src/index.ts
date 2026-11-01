// @fitts/vite-plugin (SPEC-phase2 §3.3, SPEC-phase4 §2): in `vite serve` only, stamps
// data-fitts-src="relative/path.tsx:line:col" on JSX elements, so Fitts can go from an element on
// the page straight to the line that renders it, and from a component to where it was used.
//
// v2 (Phase 4): only known HTML and SVG tags get a host stamp (a react-three-fiber <mesh> is
// left alone); component elements (<Button>, <motion.div>, <Foo.Bar>) get a call-site stamp,
// which React keeps in the component fiber's props even when it never reaches the DOM; anything
// under a <Canvas> from @react-three/fiber is skipped; `// fitts-ignore-file` opts a file out.
import { parse } from '@babel/parser';
import MagicString from 'magic-string';
import { relative } from 'node:path';
import type { Plugin } from 'vite';
import { HTML_TAGS, isKnownHostTag, SVG_TAGS } from './tags';

export { HTML_TAGS, SVG_TAGS };

export const ATTR = 'data-fitts-src';

/** A comment anywhere in the file that opts it out of stamping. */
export const IGNORE_FILE = /(?:\/\/|\/\*)\s*fitts-ignore-file\b/;

/** The packages whose <Canvas> subtree is three.js, not the DOM. */
const CANVAS_SOURCES = new Set(['@react-three/fiber']);

interface Node {
  type: string;
  start?: number | null;
  end?: number | null;
  loc?: { start: { line: number; column: number } } | null;
  [key: string]: unknown;
}

/** `div`, `button`: a host element the plugin knows. */
function hostTagName(name: Node): string | null {
  if (name.type !== 'JSXIdentifier') return null;
  const n = String(name['name']);
  return /^[a-z]/.test(n) && isKnownHostTag(n) ? n : null;
}

/** `Button`, `motion.div`, `Foo.Bar`: a component element. */
function isComponentTag(name: Node): boolean {
  if (name.type === 'JSXMemberExpression') return true;
  return name.type === 'JSXIdentifier' && /^[A-Z_$]/.test(String(name['name']));
}

function hasAttr(attrs: Node[]): boolean {
  return attrs.some(
    (a) =>
      a.type === 'JSXAttribute' &&
      (a['name'] as Node | undefined)?.type === 'JSXIdentifier' &&
      (a['name'] as Node)['name'] === ATTR,
  );
}

/** The local names `Canvas` from @react-three/fiber is imported as in this file. */
function canvasNames(ast: Node): Set<string> {
  const out = new Set<string>();
  const body = (ast['program'] as Node | undefined)?.['body'];
  if (!Array.isArray(body)) return out;
  for (const stmt of body as Node[]) {
    if (stmt.type !== 'ImportDeclaration') continue;
    const value = (stmt['source'] as Node)['value'];
    if (typeof value !== 'string' || !CANVAS_SOURCES.has(value)) continue;
    for (const spec of (stmt['specifiers'] as Node[]) ?? []) {
      if (spec.type !== 'ImportSpecifier') continue;
      const imported = spec['imported'] as Node;
      const name = imported.type === 'Identifier' ? imported['name'] : imported['value'];
      if (name === 'Canvas') out.add(String((spec['local'] as Node)['name']));
    }
  }
  return out;
}

/** The tag name of a JSX element's opening tag, as written ("Canvas", "motion.div"). */
function tagText(name: Node): string {
  if (name.type === 'JSXIdentifier') return String(name['name']);
  if (name.type === 'JSXMemberExpression')
    return `${tagText(name['object'] as Node)}.${tagText(name['property'] as Node)}`;
  return '';
}

/**
 * Walks the tree; `visit` returns false to skip a node's children (a <Canvas> subtree).
 */
function walk(node: unknown, visit: (n: Node) => boolean | void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  const n = node as Node;
  if (typeof n.type === 'string' && visit(n) === false) return;
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
  if (!code.includes('<') || IGNORE_FILE.test(code)) return null;
  let ast: Node;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: file.endsWith('.tsx') || file.endsWith('.ts') ? ['jsx', 'typescript'] : ['jsx'],
      errorRecovery: true,
    }) as unknown as Node;
  } catch {
    return null;
  }
  const rel = relative(root, file).split('\\').join('/');
  const canvases = canvasNames(ast);
  const s = new MagicString(code);
  let changed = false;
  walk(ast, (n) => {
    if (n.type === 'JSXElement') {
      const opening = n['openingElement'] as Node;
      // three.js elements under a <Canvas> aren't DOM: nothing in there is stamped.
      if (canvases.size > 0 && canvases.has(tagText(opening['name'] as Node))) return false;
      return;
    }
    if (n.type !== 'JSXOpeningElement') return;
    const name = n['name'] as Node;
    if (!hostTagName(name) && !isComponentTag(name)) return;
    if (hasAttr((n['attributes'] as Node[]) ?? [])) return;
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
