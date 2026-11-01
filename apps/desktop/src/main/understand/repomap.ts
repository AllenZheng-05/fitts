// The repo map (SPEC-phase4 §3.2): every source file's exports and imports, ranked by how
// many files import it (a small PageRank over the import graph), rendered under a token
// budget for Pass 2. Babel parses TS/JS; Svelte, Vue and Astro files get their names only.
import { parse } from '@babel/parser';
import { readText, resolveImport, SOURCE_EXT, tokensOf } from './files';

export interface MapEntry {
  file: string;
  exports: string[];
  defaultExport?: string;
  imports: string[];
  /** Imported-by count. */
  inDegree: number;
  rank: number;
}

interface Node {
  type: string;
  [key: string]: unknown;
}

const name = (n: unknown): string | undefined => {
  const node = n as Node | undefined;
  if (!node) return undefined;
  if (node.type === 'Identifier') return String(node['name']);
  if (node.type === 'VariableDeclaration')
    return name((node['declarations'] as Node[])?.[0]?.['id']);
  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'ClassDeclaration' ||
    node.type === 'TSInterfaceDeclaration' ||
    node.type === 'TSTypeAliasDeclaration' ||
    node.type === 'TSEnumDeclaration'
  )
    return name(node['id']);
  return undefined;
};

/** One file's exports and import sources. */
export function outline(
  code: string,
  file: string,
): { exports: string[]; defaultExport?: string; imports: string[] } {
  const exports: string[] = [];
  let defaultExport: string | undefined;
  const imports: string[] = [];
  if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(file)) {
    // Svelte, Vue, Astro: the file is the component; `import x from './y'` lines still count.
    for (const m of code.matchAll(/import\s+[^'"]*?from\s*['"]([^'"]+)['"]/g))
      imports.push(m[1] ?? '');
    return { exports, imports };
  }
  let ast: Node;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        ...(/\.(ts|tsx|mts|cts)$/.test(file) ? (['typescript'] as const) : []),
        'decorators',
      ],
      errorRecovery: true,
      attachComment: false,
    }) as unknown as Node;
  } catch {
    return { exports, imports };
  }
  const body = ((ast['program'] as Node)['body'] as Node[]) ?? [];
  for (const stmt of body) {
    if (stmt.type === 'ImportDeclaration') {
      const src = (stmt['source'] as Node)['value'];
      if (typeof src === 'string') imports.push(src);
    } else if (stmt.type === 'ExportNamedDeclaration') {
      const decl = stmt['declaration'] as Node | null;
      if (decl) {
        if (decl.type === 'VariableDeclaration')
          for (const d of decl['declarations'] as Node[]) {
            const n = name(d['id']);
            if (n) exports.push(n);
          }
        else {
          const n = name(decl);
          if (n) exports.push(n);
        }
      }
      for (const spec of (stmt['specifiers'] as Node[]) ?? []) {
        const n = name(spec['exported']);
        if (n) exports.push(n);
      }
      const src = (stmt['source'] as Node | null)?.['value'];
      if (typeof src === 'string') imports.push(src);
    } else if (stmt.type === 'ExportDefaultDeclaration') {
      defaultExport = name(stmt['declaration']) ?? 'default';
    } else if (stmt.type === 'ExportAllDeclaration') {
      const src = (stmt['source'] as Node)['value'];
      if (typeof src === 'string') imports.push(src);
    }
  }
  return { exports, ...(defaultExport ? { defaultExport } : {}), imports };
}

/** The map over `files` (project-relative), ranked. */
export function repoMap(root: string, files: string[]): MapEntry[] {
  const source = files.filter((f) => SOURCE_EXT.test(f));
  const set = new Set(source);
  const entries = new Map<string, MapEntry>();
  for (const f of source) {
    const o = outline(readText(root, f, 200_000), f);
    entries.set(f, {
      file: f,
      exports: o.exports.slice(0, 40),
      ...(o.defaultExport ? { defaultExport: o.defaultExport } : {}),
      imports: o.imports.map((s) => resolveImport(f, s, set) ?? '').filter(Boolean),
      inDegree: 0,
      rank: 0,
    });
  }
  for (const e of entries.values())
    for (const i of e.imports) {
      const t = entries.get(i);
      if (t) t.inDegree += 1;
    }
  // PageRank, 20 iterations, damping 0.85: importance flows from importers to what they import.
  const n = Math.max(1, entries.size);
  const list = [...entries.values()];
  let rank = new Map(list.map((e) => [e.file, 1 / n]));
  for (let i = 0; i < 20; i++) {
    const next = new Map(list.map((e) => [e.file, 0.15 / n]));
    for (const e of list) {
      const out = e.imports.filter((x) => entries.has(x));
      const share = (rank.get(e.file) ?? 0) * 0.85;
      if (out.length === 0)
        for (const k of next.keys()) next.set(k, (next.get(k) ?? 0) + share / n);
      else for (const o of out) next.set(o, (next.get(o) ?? 0) + share / out.length);
    }
    rank = next;
  }
  for (const e of list) e.rank = rank.get(e.file) ?? 0;
  return list.sort((a, b) => b.rank - a.rank || a.file.localeCompare(b.file));
}

/** The map as text, most important first, under `budgetTokens`. */
export function renderRepoMap(entries: MapEntry[], budgetTokens = 6000): string {
  const lines: string[] = [];
  let used = 0;
  for (const e of entries) {
    const parts = [
      e.defaultExport ? `default ${e.defaultExport}` : '',
      e.exports.length
        ? `exports ${e.exports.slice(0, 12).join(', ')}${e.exports.length > 12 ? ', …' : ''}`
        : '',
      e.imports.length
        ? `imports ${e.imports.slice(0, 8).join(', ')}${e.imports.length > 8 ? ', …' : ''}`
        : '',
    ].filter(Boolean);
    const line = `${e.file} (imported by ${e.inDegree})${parts.length ? ': ' + parts.join('; ') : ''}`;
    const cost = tokensOf(line) + 1;
    if (used + cost > budgetTokens) break;
    used += cost;
    lines.push(line);
  }
  if (lines.length < entries.length)
    lines.push(`… and ${entries.length - lines.length} more files`);
  return lines.join('\n');
}
