// Pass 1 of the App Model (SPEC-phase4 §3.2): a deterministic extractor over the project's
// source. Routes from the framework's file conventions or router code, forms, API calls,
// login gates, design tokens, breakpoints and media rules, sensitive files, the stack. No
// network; Babel parses TS/JS; everything else is read as text. It never writes.
import { parse } from '@babel/parser';
import type { AppModel, AppPage } from '@fitts/schema';
import {
  listFiles,
  normalize,
  readJson,
  readText,
  resolveImport,
  SOURCE_EXT,
  STYLE_EXT,
} from './files';

/** What Pass 1 knows; Pass 2 adds the summary, features, journeys and titles. */
export interface Extracted extends Pick<
  AppModel,
  'kind' | 'stack' | 'pages' | 'tokens' | 'apis' | 'breakpoints' | 'media' | 'sensitive'
> {
  /** The project's name from package.json. */
  name: string;
  /** Every source file seen (project-relative). */
  files: string[];
  /** Routes whose component file is known: what Pass 2 reads. */
  routeFiles: { route: string; file: string }[];
  notes: string[];
}

interface Pkg {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

interface Node {
  type: string;
  loc?: { start: { line: number; column: number } } | null;
  [key: string]: unknown;
}

const TAILWIND_SCREENS = [640, 768, 1024, 1280, 1536];
const LOGIN_ROUTE = /\/(login|signin|sign-in|auth|register|signup|sign-up)(\/|$)/i;

// ── Parsing ──────────────────────────────────────────────────────────────────

function parseFile(code: string, file: string): Node | null {
  try {
    return parse(code, {
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
    return null;
  }
}

/** Depth-first visit of every node with a `type`. */
function walk(
  node: unknown,
  visit: (n: Node, parent: Node | null) => void,
  parent: Node | null = null,
): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent);
    return;
  }
  const n = node as Node;
  const isNode = typeof n.type === 'string';
  if (isNode) visit(n, parent);
  for (const key of Object.keys(n)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra' || key === 'comments')
      continue;
    const value = n[key];
    if (value && typeof value === 'object') walk(value, visit, isNode ? n : parent);
  }
}

const str = (n: unknown): string | undefined => {
  const node = n as Node | undefined;
  if (!node) return undefined;
  if (node.type === 'StringLiteral' || node.type === 'Literal')
    return typeof node['value'] === 'string' ? node['value'] : undefined;
  if (node.type === 'NumericLiteral' || node.type === 'BooleanLiteral')
    return String(node['value']);
  if (node.type === 'TemplateLiteral') {
    const quasis = node['quasis'] as Node[];
    if (quasis.length === 1)
      return String((quasis[0]?.['value'] as { cooked?: string })?.cooked ?? '');
  }
  if (node.type === 'JSXExpressionContainer') return str(node['expression']);
  return undefined;
};

const ident = (n: unknown): string | undefined => {
  const node = n as Node | undefined;
  if (!node) return undefined;
  if (node.type === 'Identifier' || node.type === 'JSXIdentifier') return String(node['name']);
  if (node.type === 'JSXMemberExpression' || node.type === 'MemberExpression')
    return `${ident(node['object']) ?? ''}.${ident(node['property']) ?? ''}`;
  return undefined;
};

/** The import map of a module: local name → { source, imported }. */
function importsOf(ast: Node): Map<string, { source: string; imported: string }> {
  const out = new Map<string, { source: string; imported: string }>();
  const body = (ast['program'] as Node | undefined)?.['body'];
  if (!Array.isArray(body)) return out;
  for (const stmt of body as Node[]) {
    if (stmt.type !== 'ImportDeclaration') continue;
    const source = str(stmt['source']);
    if (!source) continue;
    for (const spec of (stmt['specifiers'] as Node[]) ?? []) {
      const local = ident(spec['local']);
      if (!local) continue;
      const imported =
        spec.type === 'ImportDefaultSpecifier'
          ? 'default'
          : spec.type === 'ImportNamespaceSpecifier'
            ? '*'
            : (ident(spec['imported']) ?? str(spec['imported']) ?? local);
      out.set(local, { source, imported });
    }
  }
  return out;
}

/** The component an element or `lazy(() => import('./x'))` names, as an import source. */
function componentSource(
  expr: unknown,
  imports: Map<string, { source: string; imported: string }>,
): string | undefined {
  const n = expr as Node | undefined;
  if (!n) return undefined;
  if (n.type === 'JSXExpressionContainer') return componentSource(n['expression'], imports);
  if (n.type === 'JSXElement') {
    const name = ident((n['openingElement'] as Node)['name']);
    const head = name?.split('.')[0];
    return head ? imports.get(head)?.source : undefined;
  }
  if (n.type === 'Identifier') return imports.get(String(n['name']))?.source;
  if (
    n.type === 'CallExpression' ||
    n.type === 'ArrowFunctionExpression' ||
    n.type === 'FunctionExpression'
  ) {
    let found: string | undefined;
    walk(n, (x) => {
      if (!found && x.type === 'ImportExpression') found = str(x['source']);
      if (!found && x.type === 'CallExpression' && (x['callee'] as Node).type === 'Import')
        found = str((x['arguments'] as Node[])[0]);
    });
    return found;
  }
  return undefined;
}

const joinRoute = (parent: string, child: string): string => {
  if (child.startsWith('/')) return child.replace(/\/+$/, '') || '/';
  const base = parent.replace(/\/+$/, '');
  const path = child ? `${base}/${child}` : base;
  return path.replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
};

/** Next/SvelteKit/Expo/TanStack path segments → "/team/:id". */
function fileRoute(parts: string[]): string {
  const segs = parts
    .filter((p) => !/^\(.*\)$/.test(p) && !/^@/.test(p) && p !== 'index')
    .map((p) =>
      p
        .replace(/^\[\.\.\.(.+)\]$/, ':$1*')
        .replace(/^\[\[\.\.\.(.+)\]\]$/, ':$1*')
        .replace(/^\[(.+)\]$/, ':$1')
        .replace(/^\$(.+)$/, ':$1'),
    );
  return `/${segs.join('/')}`.replace(/\/+$/, '') || '/';
}

// ── The extractor ────────────────────────────────────────────────────────────

export function extract(root: string, projectKind: 'web' | 'android' = 'web'): Extracted {
  const pkg = readJson<Pkg>(root, 'package.json') ?? {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const has = (d: string) => d in deps;
  const files = listFiles(root);
  const fileSet = new Set(files);
  const notes: string[] = [];

  // Parse every TS/JS source once (capped), sharing the ASTs across the steps below.
  const asts = new Map<string, Node>();
  const texts = new Map<string, string>();
  let parsed = 0;
  for (const f of files) {
    if (!SOURCE_EXT.test(f)) continue;
    const text = readText(root, f);
    texts.set(f, text);
    if (/\.(tsx?|jsx?|mjs|cjs)$/.test(f) && parsed < 1500 && text.length < 200_000) {
      const ast = parseFile(text, f);
      if (ast) asts.set(f, ast);
      parsed += 1;
    }
  }

  const pages = new Map<string, AppPage>();
  const page = (route: string, file?: string): AppPage => {
    const key = route.replace(/\/+$/, '') || '/';
    let p = pages.get(key);
    if (!p) {
      p = { route: key, source: 'code', features: [], forms: [] };
      const dyn = /:([A-Za-z_]\w*)/.exec(key);
      if (dyn?.[1]) p.dynamic = { param: dyn[1] };
      pages.set(key, p);
    }
    if (file && !p.file) p.file = file;
    return p;
  };

  // 1. Routes from file conventions.
  let router: AppModel['stack']['router'] = 'unknown';
  const appDir = files.some((f) => /^(src\/)?app\/.*page\.(tsx|jsx|ts|js)$/.test(f)) && has('next');
  if (appDir) {
    router = 'next-app';
    for (const f of files) {
      const m = /^(?:src\/)?app\/(.*?)(?:^|\/)?page\.(tsx|jsx|ts|js)$/.exec(f);
      if (!m) continue;
      const parts = m[1] ? m[1].replace(/\/$/, '').split('/').filter(Boolean) : [];
      const p = page(fileRoute(parts), f);
      const dir = f.replace(/page\.\w+$/, '');
      const layout = files.find(
        (x) =>
          x.startsWith(dir) &&
          /^.*layout\.(tsx|jsx|ts|js)$/.test(x) &&
          x.replace(/layout\.\w+$/, '') === dir,
      );
      if (layout) p.layout = layout;
    }
  } else if (has('next') && files.some((f) => /^(src\/)?pages\//.test(f))) {
    router = 'next-pages';
    for (const f of files) {
      const m = /^(?:src\/)?pages\/(.+)\.(tsx|jsx|ts|js|mdx?)$/.exec(f);
      if (!m?.[1]) continue;
      const parts = m[1].split('/');
      if (parts[0] === 'api' || /^_/.test(parts[parts.length - 1] ?? '')) continue;
      page(fileRoute(parts), f);
    }
  } else if (has('@sveltejs/kit')) {
    router = 'sveltekit';
    for (const f of files) {
      const m = /^src\/routes\/(.*?)\+page\.svelte$/.exec(f);
      if (!m) continue;
      const parts = (m[1] ?? '').split('/').filter(Boolean);
      page(fileRoute(parts), f);
    }
  } else if (has('astro')) {
    router = 'astro';
    for (const f of files) {
      const m = /^src\/pages\/(.+)\.(astro|mdx?)$/.exec(f);
      if (!m?.[1]) continue;
      page(fileRoute(m[1].split('/')), f);
    }
  } else if (has('expo-router')) {
    router = 'expo-router';
    for (const f of files) {
      const m = /^(?:src\/)?app\/(.+)\.(tsx|jsx|ts|js)$/.exec(f);
      if (!m?.[1]) continue;
      const parts = m[1].split('/');
      if (
        /^_layout$/.test(parts[parts.length - 1] ?? '') ||
        /^\+/.test(parts[parts.length - 1] ?? '')
      )
        continue;
      page(fileRoute(parts), f);
    }
  } else if (has('@tanstack/react-router') || has('@tanstack/router')) {
    router = 'tanstack';
    for (const f of files) {
      const m = /^src\/routes\/(.+)\.(tsx|jsx|ts|js)$/.exec(f);
      if (!m?.[1] || /__root$/.test(m[1])) continue;
      page(fileRoute(m[1].replace(/\.(lazy|index)$/, '').split(/[/.]/)), f);
    }
  } else if (has('react-router') || has('react-router-dom')) router = 'react-router';
  else if (has('@react-navigation/native')) router = 'react-navigation';

  // 2. Routes from router code: react-router objects and elements, and a path switch (a
  //    hand-rolled router like demo/chat's `switch (path)`).
  for (const [f, ast] of asts) {
    const imports = importsOf(ast);
    const fileFor = (source: string | undefined) =>
      source ? resolveImport(f, source, fileSet) : undefined;
    const fromRoutes = (routes: Node[], parent: string) => {
      for (const r of routes) {
        if (r.type !== 'ObjectExpression') continue;
        let path: string | undefined;
        let element: unknown;
        let children: Node[] | undefined;
        let index = false;
        for (const prop of (r['properties'] as Node[]) ?? []) {
          const key = ident(prop['key']) ?? str(prop['key']);
          if (key === 'path') path = str(prop['value']);
          if (key === 'index' && (prop['value'] as Node)['value'] === true) index = true;
          if (key === 'element' || key === 'Component' || key === 'lazy' || key === 'component')
            element = prop['value'];
          if (key === 'children' && (prop['value'] as Node).type === 'ArrayExpression')
            children = (prop['value'] as Node)['elements'] as Node[];
        }
        const route = path !== undefined ? joinRoute(parent, path) : index ? parent : undefined;
        if (route && (element || index))
          page(route, fileFor(componentSource(element, imports)) ?? undefined);
        if (children) fromRoutes(children, route ?? parent);
      }
    };
    walk(ast, (n) => {
      if (n.type === 'CallExpression') {
        const callee = ident(n['callee']);
        const arg0 = (n['arguments'] as Node[])?.[0];
        if (
          (callee === 'createBrowserRouter' ||
            callee === 'createHashRouter' ||
            callee === 'createMemoryRouter' ||
            callee === 'useRoutes') &&
          arg0?.type === 'ArrayExpression'
        ) {
          if (router === 'unknown') router = 'react-router';
          fromRoutes(arg0['elements'] as Node[], '/');
        }
      }
      if (n.type === 'JSXElement') {
        const open = n['openingElement'] as Node;
        if (ident(open['name']) !== 'Route') return;
        const attrs = (open['attributes'] as Node[]) ?? [];
        const attr = (name: string) =>
          attrs.find((a) => a.type === 'JSXAttribute' && ident(a['name']) === name);
        const path = str(attr('path')?.['value']);
        if (path === undefined) return;
        if (router === 'unknown') router = 'react-router';
        // Nested <Route>s: the parents' paths join in. Found by walking up is costly; routes
        // are joined as written, which is right for the common flat form.
        const element =
          attr('element')?.['value'] ??
          attr('Component')?.['value'] ??
          attr('component')?.['value'];
        page(joinRoute('/', path), fileFor(componentSource(element, imports)) ?? undefined);
      }
      if (n.type === 'SwitchCase') {
        const test = str(n['test']);
        if (!test?.startsWith('/')) return;
        let element: Node | undefined;
        walk(n['consequent'], (x) => {
          if (
            !element &&
            x.type === 'ReturnStatement' &&
            (x['argument'] as Node | null)?.type === 'JSXElement'
          )
            element = x['argument'] as Node;
        });
        if (element)
          page(joinRoute('/', test), fileFor(componentSource(element, imports)) ?? undefined);
      }
    });
  }

  // 3. Forms, API calls and gates, per file; mapped to pages by the route's file.
  const fileOfRoute = new Map<string, string>();
  for (const p of pages.values()) if (p.file) fileOfRoute.set(p.file, p.route);
  const apis = new Map<string, AppModel['apis'][number]>();
  const api = (method: string, path: string, file: string, line: number, usedBy?: string) => {
    const key = `${method} ${path}`;
    const e = apis.get(key) ?? { method, path, file, line, usedBy: [] };
    if (usedBy && !e.usedBy.includes(usedBy)) e.usedBy.push(usedBy);
    apis.set(key, e);
  };
  const authFiles = new Set<string>();
  for (const [f, ast] of asts) {
    const text = texts.get(f) ?? '';
    const route = fileOfRoute.get(f);
    walk(ast, (n) => {
      // <form> and its fields.
      if (n.type === 'JSXElement' && ident((n['openingElement'] as Node)['name']) === 'form') {
        const open = n['openingElement'] as Node;
        const attrs = (open['attributes'] as Node[]) ?? [];
        const attrStr = (el: Node, name: string) => {
          const a = ((el['attributes'] as Node[]) ?? []).find(
            (x) => x.type === 'JSXAttribute' && ident(x['name']) === name,
          );
          if (!a) return undefined;
          const v = a['value'] as Node | null;
          if (v === null) return 'true';
          return (
            str(v) ??
            (v.type === 'JSXExpressionContainer' ? (ident(v['expression']) ?? 'expr') : undefined)
          );
        };
        const fields: AppPage['forms'][number]['fields'] = [];
        walk(n['children'], (x) => {
          if (x.type !== 'JSXElement') return;
          const el = x['openingElement'] as Node;
          const tag = ident(el['name']);
          if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
          const type =
            attrStr(el, 'type') ??
            (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'text');
          if (type === 'hidden' || type === 'submit' || type === 'button') return;
          const name =
            attrStr(el, 'name') ??
            attrStr(el, 'aria-label') ??
            attrStr(el, 'id') ??
            attrStr(el, 'placeholder') ??
            tag;
          const rule = [
            attrStr(el, 'pattern') ? `pattern ${attrStr(el, 'pattern')}` : '',
            attrStr(el, 'min') ? `min ${attrStr(el, 'min')}` : '',
            attrStr(el, 'max') ? `max ${attrStr(el, 'max')}` : '',
            attrStr(el, 'minLength') ? `minLength ${attrStr(el, 'minLength')}` : '',
            attrStr(el, 'maxLength') ? `maxLength ${attrStr(el, 'maxLength')}` : '',
          ]
            .filter(Boolean)
            .join(', ');
          fields.push({
            name,
            type,
            required: attrStr(el, 'required') !== undefined,
            ...(rule ? { rule } : {}),
          });
        });
        const submit = attrs.find(
          (a) => a.type === 'JSXAttribute' && ident(a['name']) === 'onSubmit',
        );
        const handler = submit
          ? (ident((submit['value'] as Node)['expression']) ?? 'inline')
          : undefined;
        const name =
          attrStr(open, 'aria-label') ??
          attrStr(open, 'name') ??
          attrStr(open, 'id') ??
          attrStr(open, 'data-ref') ??
          'form';
        const target = route ? pages.get(route) : undefined;
        const form = {
          name,
          fields,
          ...(handler ? { submit: handler } : {}),
          file: f,
          line: n.loc?.start.line ?? 1,
        };
        if (target) target.forms.push(form);
        else {
          // A form in a shared component: it belongs to every page that imports the file.
          for (const p of pages.values())
            if (p.file && importsFile(asts.get(p.file), p.file, f, fileSet)) p.forms.push(form);
        }
      }
      // fetch('/api/x'), axios.get('/api/x'), ky.post(...)
      if (n.type === 'CallExpression') {
        const callee = ident(n['callee']);
        const args = (n['arguments'] as Node[]) ?? [];
        const url = str(args[0]);
        if (!callee || !url || !/^(\/|https?:)/.test(url)) return;
        const m = /^(?:axios|ky|api|http|client)\.(get|post|put|patch|delete)$/i.exec(callee);
        if (callee === 'fetch' || m) {
          let method = m?.[1]?.toUpperCase() ?? 'GET';
          const opts = args[1];
          if (opts?.type === 'ObjectExpression')
            for (const prop of opts['properties'] as Node[])
              if (ident(prop['key']) === 'method')
                method = (str(prop['value']) ?? method).toUpperCase();
          api(method, url, f, n.loc?.start.line ?? 1, f);
        }
      }
    });
    // Server-side handlers: strings under /api/ compared with a method nearby (a Vite
    // middleware, an Express app), Next route files, SvelteKit +server.
    if (
      /^(?:src\/)?app\/.*route\.(ts|js)$/.test(f) ||
      /^(?:src\/)?pages\/api\//.test(f) ||
      /\+server\.(ts|js)$/.test(f)
    ) {
      const route = fileRoute(
        f
          .replace(/^(src\/)?(app|pages|routes)\//, '')
          .replace(/\/?(route|\+server)\.\w+$/, '')
          .split('/'),
      );
      const methods = [
        ...text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g),
      ].map((x) => x[1] ?? 'GET');
      for (const method of methods.length ? methods : ['GET'])
        api(method, route.startsWith('/api') ? route : `/api${route}`, f, 1);
      authFiles.add(f);
    } else if (/server|api|middleware/i.test(f) && !route) {
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        const p = /['"`](\/api\/[^'"`?]+)['"`]/.exec(line);
        if (!p?.[1]) return;
        const method =
          /method\s*===?\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/i.exec(line)?.[1]?.toUpperCase() ??
          /\.(get|post|put|patch|delete)\(/i.exec(line)?.[1]?.toUpperCase() ??
          'GET';
        api(method, p[1].replace(/:\w+/g, ':id'), f, i + 1);
      });
      if (/\/api\//.test(text)) authFiles.add(f);
    }
    // Login gates.
    if (route && pages.has(route) && !LOGIN_ROUTE.test(route)) {
      const gated =
        /redirect\(\s*['"`]\/(login|signin|sign-in|auth)/i.test(text) ||
        /<Navigate\s+to=['"]\/(login|signin|sign-in|auth)/i.test(text) ||
        /if\s*\(\s*!\s*(session|user|token|isAuthenticated|auth|loggedIn)\b/i.test(text);
      if (gated) pages.get(route)!.gate = 'login';
    }
    if (/auth|session|login/i.test(f) && !route) authFiles.add(f);
  }
  // middleware.ts matchers gate what they match.
  const middleware = files.find((f) => /^(src\/)?middleware\.(ts|js)$/.test(f));
  if (middleware) {
    const text = texts.get(middleware) ?? '';
    const matcher =
      /matcher\s*:\s*\[([^\]]*)\]/.exec(text)?.[1] ??
      /matcher\s*:\s*['"]([^'"]+)['"]/.exec(text)?.[1] ??
      '';
    const patterns = [...matcher.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
    for (const pattern of patterns.length ? patterns : [matcher].filter(Boolean)) {
      const re = new RegExp(
        `^${pattern.replace(/\/:path\*|:path\*|\(\.\*\)|\*/g, '.*').replace(/:\w+/g, '[^/]+')}$`,
      );
      for (const p of pages.values())
        if (re.test(p.route) && !LOGIN_ROUTE.test(p.route)) p.gate = 'login';
    }
  }

  // 4. Tokens, breakpoints and media rules.
  const tokens: AppModel['tokens'] = [];
  const widths = new Set<number>();
  let darkMode = false;
  let reducedMotion = false;
  for (const f of files) {
    if (!STYLE_EXT.test(f) && !/\.(tsx?|jsx?|svelte|vue|astro)$/.test(f)) continue;
    const text = texts.get(f) ?? (STYLE_EXT.test(f) ? readText(root, f, 200_000) : '');
    if (!text) continue;
    if (STYLE_EXT.test(f) || /\.(svelte|vue|astro)$/.test(f)) {
      const vars = [...text.matchAll(/(?::root|@theme)[^{]*\{([^}]*)\}/g)].flatMap((m) =>
        [...(m[1] ?? '').matchAll(/--([\w-]+)\s*:/g)].map((v) => `--${v[1] ?? ''}`),
      );
      if (vars.length)
        tokens.push({ file: f, kind: 'css-vars', names: [...new Set(vars)].slice(0, 200) });
    }
    for (const m of text.matchAll(
      /@(?:media|container)[^{]*?\(\s*(?:min|max)-width\s*:\s*([\d.]+)(px|em|rem)\s*\)/g,
    )) {
      const n = Number(m[1]);
      widths.add(Math.round(m[2] === 'px' ? n : n * 16));
    }
    for (const m of text.matchAll(/@media[^{]*?width\s*(?:<=?|>=?)\s*([\d.]+)(px|em|rem)/g)) {
      const n = Number(m[1]);
      widths.add(Math.round(m[2] === 'px' ? n : n * 16));
    }
    if (/prefers-color-scheme\s*:\s*dark/.test(text)) darkMode = true;
    if (/prefers-reduced-motion/.test(text)) reducedMotion = true;
  }
  const tailwindConfig = files.find((f) => /^tailwind\.config\.(ts|js|mjs|cjs)$/.test(f));
  if (tailwindConfig) {
    const text = texts.get(tailwindConfig) ?? readText(root, tailwindConfig);
    const screens = [...text.matchAll(/['"]?(\w+)['"]?\s*:\s*['"](\d+)px['"]/g)];
    const inScreens = /screens\s*:\s*\{/.test(text);
    if (inScreens && screens.length) for (const s of screens) widths.add(Number(s[2]));
    else if (has('tailwindcss')) for (const w of TAILWIND_SCREENS) widths.add(w);
    const names = [...text.matchAll(/^\s{4,8}['"]?([a-zA-Z][\w-]*)['"]?\s*:\s*\{/gm)].map(
      (m) => m[1] ?? '',
    );
    tokens.push({
      file: tailwindConfig,
      kind: 'tailwind',
      names: [...new Set(names)].slice(0, 100),
    });
  } else if (has('tailwindcss')) {
    const themed = files.some(
      (f) => STYLE_EXT.test(f) && /@theme/.test(texts.get(f) ?? readText(root, f, 200_000)),
    );
    if (!themed || widths.size === 0) for (const w of TAILWIND_SCREENS) widths.add(w);
  }
  for (const f of files) {
    if (!/(^|\/)theme\.(ts|js)$/.test(f)) continue;
    const text = texts.get(f) ?? '';
    const names = [...text.matchAll(/^\s+([a-zA-Z][\w]*)\s*:/gm)].map((m) => m[1] ?? '');
    if (names.length)
      tokens.push({ file: f, kind: 'theme-object', names: [...new Set(names)].slice(0, 100) });
  }

  // 5. Sensitive files (§7.3).
  const sensitive = files.filter(
    (f) =>
      /(^|\/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|bun\.lockb?)$/.test(f) ||
      /(^|\/)\.env(\.|$)/.test(f) ||
      /^\.github\//.test(f) ||
      /^(src\/)?middleware\.(ts|js)$/.test(f) ||
      authFiles.has(f),
  );

  // 6. The stack.
  const ts = files.filter((f) => /\.(ts|tsx)$/.test(f)).length;
  const js = files.filter((f) => /\.(js|jsx|mjs|cjs)$/.test(f)).length;
  const styling: string[] = [];
  if (has('tailwindcss')) styling.push('tailwind');
  if (files.some((f) => /\.module\.(css|scss)$/.test(f))) styling.push('css-modules');
  if (has('styled-components') || has('@emotion/styled')) styling.push('styled-components');
  if (files.some((f) => STYLE_EXT.test(f) && !/\.module\./.test(f))) styling.push('css');
  const ui: string[] = [];
  if (has('@mui/material')) ui.push('mui');
  if (has('@chakra-ui/react')) ui.push('chakra');
  if (has('antd')) ui.push('antd');
  if (has('@mantine/core')) ui.push('mantine');
  if (Object.keys(deps).some((d) => d.startsWith('@radix-ui/'))) ui.push('radix');
  if (files.some((f) => /components\/ui\//.test(f))) ui.push('shadcn');
  if (has('@react-three/fiber')) ui.push('react-three-fiber');
  const tests: string[] = [];
  for (const [d, name] of [
    ['vitest', 'vitest'],
    ['jest', 'jest'],
    ['@playwright/test', 'playwright'],
    ['cypress', 'cypress'],
    ['mocha', 'mocha'],
  ] as const)
    if (has(d)) tests.push(name);
  const framework = has('next')
    ? 'Next.js'
    : has('@sveltejs/kit')
      ? 'SvelteKit'
      : has('astro')
        ? 'Astro'
        : has('expo')
          ? 'Expo'
          : has('react-native')
            ? 'React Native'
            : has('vite')
              ? `Vite${has('react') ? ' + React' : has('vue') ? ' + Vue' : has('svelte') ? ' + Svelte' : ''}`
              : has('react')
                ? 'React'
                : 'Unknown';

  const list = [...pages.values()].sort((a, b) => a.route.localeCompare(b.route));
  if (list.length === 0)
    notes.push('I couldn’t find any pages in the code; the crawl will discover them.');
  return {
    kind: projectKind,
    name: pkg.name?.replace(/^@[^/]+\//, '') ?? '',
    stack: {
      framework,
      language: ts && js ? 'mixed' : ts ? 'ts' : 'js',
      styling,
      router,
      ui,
      tests,
    },
    pages: list,
    tokens,
    apis: [...apis.values()].sort((a, b) => a.path.localeCompare(b.path)).slice(0, 200),
    breakpoints: [...widths]
      .filter((w) => w >= 240 && w <= 3000)
      .sort((a, b) => a - b)
      .slice(0, 12),
    media: { darkMode, reducedMotion },
    sensitive,
    files,
    routeFiles: list.flatMap((p) => (p.file ? [{ route: p.route, file: p.file }] : [])),
    notes,
  };
}

/** Whether `file`'s module imports `other` (directly), by its import sources. */
function importsFile(
  ast: Node | undefined,
  file: string,
  other: string,
  files: Set<string>,
): boolean {
  if (!ast) return false;
  for (const { source } of importsOf(ast).values())
    if (resolveImport(file, source, files) === other) return true;
  return false;
}

export { normalize };
