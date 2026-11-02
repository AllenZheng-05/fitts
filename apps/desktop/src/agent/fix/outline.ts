// The fixer's code tools (SPEC-phase4 §7.2): `outline(path)` lists a file's exports and its
// components with their line ranges (Babel, like the repo map), and `find_component(name)`
// turns a component name into the search that finds its definition. Pure: the fix host reads.
import { parse } from '@babel/parser';

interface Node {
  type: string;
  loc?: { start: { line: number }; end: { line: number } };
  [key: string]: unknown;
}

export interface Outline {
  exports: string[];
  /** Functions and classes whose name starts with a capital: React-style components. */
  components: { name: string; start: number; end: number }[];
  /** Other top-level functions, with their lines. */
  functions: { name: string; start: number; end: number }[];
  imports: string[];
}

const idName = (n: unknown): string | undefined => {
  const node = n as Node | undefined;
  return node?.type === 'Identifier' ? String(node['name']) : undefined;
};

/** A top-level declaration's name and lines, when it's a function, class or arrow const. */
function declared(n: Node): { name: string; start: number; end: number } | undefined {
  const lines = (x: Node) => ({ start: x.loc?.start.line ?? 0, end: x.loc?.end.line ?? 0 });
  if (n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') {
    const name = idName(n['id']);
    return name ? { name, ...lines(n) } : undefined;
  }
  if (n.type === 'VariableDeclaration') {
    const d = (n['declarations'] as Node[])?.[0];
    const init = d?.['init'] as Node | undefined;
    const name = idName(d?.['id']);
    const fn = init && /ArrowFunctionExpression|FunctionExpression|CallExpression/.test(init.type);
    return name && fn ? { name, ...lines(n) } : undefined;
  }
  return undefined;
}

export function outlineCode(code: string, file: string): Outline {
  const out: Outline = { exports: [], components: [], functions: [], imports: [] };
  if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(file)) return out;
  let ast: Node;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', ...(/\.(ts|tsx|mts|cts)$/.test(file) ? (['typescript'] as const) : [])],
      errorRecovery: true,
    }) as unknown as Node;
  } catch {
    return out;
  }
  const body = ((ast['program'] as Node)['body'] as Node[]) ?? [];
  for (const stmt of body) {
    let decl: Node = stmt;
    if (stmt.type === 'ImportDeclaration') {
      out.imports.push(String((stmt['source'] as Node)['value']));
      continue;
    }
    if (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') {
      const inner = stmt['declaration'] as Node | null;
      if (inner) decl = inner;
      if (stmt.type === 'ExportDefaultDeclaration') out.exports.push('default');
      for (const s of (stmt['specifiers'] as Node[] | undefined) ?? []) {
        const n = idName(s['exported']);
        if (n) out.exports.push(n);
      }
    }
    const d = declared(decl);
    if (!d) continue;
    if (stmt.type === 'ExportNamedDeclaration') out.exports.push(d.name);
    // Exported or not, a capitalized function is a component.
    (/^[A-Z]/.test(d.name) ? out.components : out.functions).push({
      ...d,
      start: stmt.loc?.start.line ?? d.start,
      end: stmt.loc?.end.line ?? d.end,
    });
  }
  out.exports = [...new Set(out.exports)];
  return out;
}

/** The outline as the fixer reads it. */
export function outlineText(o: Outline, path: string): string {
  const parts = [
    `${path}`,
    o.components.length
      ? `components: ${o.components.map((c) => `${c.name} (lines ${c.start}–${c.end})`).join(', ')}`
      : '',
    o.functions.length
      ? `functions: ${o.functions.map((c) => `${c.name} (lines ${c.start}–${c.end})`).join(', ')}`
      : '',
    o.exports.length ? `exports: ${o.exports.join(', ')}` : '',
    o.imports.length ? `imports: ${o.imports.join(', ')}` : '',
  ].filter(Boolean);
  return parts.length > 1 ? parts.join('\n') : `${path}: nothing to outline (not a JS/TS module)`;
}

/** The texts that define a component, for the worktree search (most specific first). */
export function componentDefinitions(name: string): string[] {
  const n = name.replace(/[^\w$]/g, '');
  return [`function ${n}(`, `const ${n} =`, `class ${n} `, `function ${n}<`];
}
