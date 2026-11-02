// The Fitts dev plugin for Vite (https://fitts.allenzheng.com). In `vite serve` only, it stamps
// data-fitts-src="path/to/File.tsx:line:col" on every HTML and SVG element your JSX renders, and
// on every component you use (<Button>, <motion.div>), so Fitts can go from an element on the
// page straight to the line that renders it and to where that component was used, and its fixes
// land in the right place. It never runs in a build, so your live site doesn't change.
//
// It has no dependencies: a small scanner finds the JSX tags, and Vite's own compiler checks the
// stamped file before it's used (a file it can't stamp safely is served as it is). Lowercase
// tags it doesn't know (react-three-fiber's <mesh>) and anything under a <Canvas> from
// @react-three/fiber are left alone; `// fitts-ignore-file` opts a file out.
import { relative } from 'node:path';

export const ATTR = 'data-fitts-src';

/** The HTML and SVG elements that get a stamp; any other lowercase tag is left alone. */
export const HTML_TAGS = new Set(
  'a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr'.split(
    ' ',
  ),
);
export const SVG_TAGS = new Set(
  'svg animate animateMotion animateTransform circle clipPath defs desc ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter foreignObject g image line linearGradient marker mask metadata mpath path pattern polygon polyline radialGradient rect set stop switch symbol text textPath tspan use view'.split(
    ' ',
  ),
);

/** A comment anywhere in the file that opts it out. */
const IGNORE_FILE = /(?:\/\/|\/\*)\s*fitts-ignore-file\b/;

/** The local names `Canvas` from @react-three/fiber is imported as (`Canvas as Scene`). */
function canvasNames(code) {
  const out = new Set();
  const re = /import\s*\{([^}]*)\}\s*from\s*['"]@react-three\/fiber['"]/g;
  for (const m of code.matchAll(re)) {
    for (const spec of m[1].split(',')) {
      const parts = spec.trim().split(/\s+as\s+/);
      if (parts[0] === 'Canvas') out.add(parts[1] ?? 'Canvas');
    }
  }
  return out;
}

/** True when a `<` at `i` (in code) can start JSX: not after a value (`a < b`, `fn<T>()`). */
function jsxCanStart(code, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(code[j])) j--;
  if (j < 0) return true;
  const p = code[j];
  if (/[\w$)\]]/.test(p)) {
    // `return <div>`, `yield <div>`, `default <div>` are JSX; `a<b` isn't.
    const word = /(?:^|[^\w$])(return|yield|default|case|await)$/.exec(
      code.slice(Math.max(0, j - 8), j + 1),
    );
    return Boolean(word);
  }
  return true;
}

/** Skips a quoted string starting at `i` (the quote), returning the index after it. */
function skipString(code, i) {
  const q = code[i];
  for (let j = i + 1; j < code.length; j++) {
    if (code[j] === '\\') j++;
    else if (code[j] === q || code[j] === '\n') return j + 1;
  }
  return code.length;
}

/**
 * The code with `data-fitts-src` added to each lowercase JSX tag (a host element), or null when
 * there's nothing to stamp. `file` is the path shown in the stamp.
 */
export function stamp(code, file) {
  if (IGNORE_FILE.test(code)) return null;
  const canvases = canvasNames(code);
  const lineStarts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === '\n') lineStarts.push(i + 1);
  const where = (index) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return `${lo + 1}:${index - lineStarts[lo]}`;
  };
  const inserts = [];
  // What the scanner is inside: code (with its brace depth), a template, a tag, a tag's children.
  const stack = [{ kind: 'code', braces: 0 }];
  /** Inside a <Canvas> from @react-three/fiber: three.js, not the DOM, so nothing is stamped. */
  const inCanvas = () => stack.some((e) => e.canvas);
  /**
   * Reads a tag name at `i` (just after `<`), stamps it if it's a known host element
   * (`div`) or a component (`Button`, `motion.div`).
   */
  const openTag = (i, lt) => {
    const m = /^[A-Za-z_$][\w.:$-]*/.exec(code.slice(i, i + 80));
    if (!m) return -1;
    const name = m[0];
    const end = i + name.length;
    if (!/[\s/>]/.test(code[end] ?? '')) return -1;
    const canvas = canvases.has(name);
    const host = /^[a-z]/.test(name) && !name.includes('.') && !name.includes(':');
    const stampable = host
      ? HTML_TAGS.has(name) || SVG_TAGS.has(name)
      : !name.includes(':') && (/^[A-Z_$]/.test(name) || name.includes('.'));
    if (stampable && !canvas && !inCanvas()) {
      const close = code.indexOf('>', end);
      const attrs = code.slice(end, close === -1 ? end + 400 : close);
      if (!attrs.includes(ATTR)) inserts.push([end, ` ${ATTR}="${file}:${where(lt)}"`]);
    }
    stack.push({ kind: 'tag', ...(canvas ? { canvas: true } : {}) });
    return end;
  };
  let i = 0;
  while (i < code.length) {
    const top = stack[stack.length - 1];
    const c = code[i];
    const next = code[i + 1];
    if (top.kind === 'code') {
      if (c === '/' && next === '/') {
        const nl = code.indexOf('\n', i);
        i = nl === -1 ? code.length : nl;
      } else if (c === '/' && next === '*') {
        const close = code.indexOf('*/', i + 2);
        i = close === -1 ? code.length : close + 2;
      } else if (c === '"' || c === "'") i = skipString(code, i);
      else if (c === '`') {
        stack.push({ kind: 'template' });
        i++;
      } else if (c === '{') {
        top.braces++;
        i++;
      } else if (c === '}') {
        if (top.braces === 0 && stack.length > 1) stack.pop();
        else top.braces--;
        i++;
      } else if (c === '<' && jsxCanStart(code, i)) {
        if (next === '>') {
          stack.push({ kind: 'children' });
          i += 2;
        } else {
          const end = openTag(i + 1, i);
          i = end === -1 ? i + 1 : end;
        }
      } else i++;
    } else if (top.kind === 'template') {
      if (c === '\\') i += 2;
      else if (c === '`') {
        stack.pop();
        i++;
      } else if (c === '$' && next === '{') {
        stack.push({ kind: 'code', braces: 0 });
        i += 2;
      } else i++;
    } else if (top.kind === 'tag') {
      if (c === '"' || c === "'") i = skipString(code, i);
      else if (c === '{') {
        stack.push({ kind: 'code', braces: 0 });
        i++;
      } else if (c === '/' && next === '>') {
        stack.pop();
        i += 2;
      } else if (c === '>') {
        // The children of a <Canvas> stay inside it.
        const tag = stack.pop();
        stack.push({ kind: 'children', ...(tag?.canvas ? { canvas: true } : {}) });
        i++;
      } else i++;
    } else {
      // A tag's children: text, {expressions}, child tags and the closing tag.
      if (c === '{') {
        stack.push({ kind: 'code', braces: 0 });
        i++;
      } else if (c === '<' && next === '/') {
        const close = code.indexOf('>', i);
        stack.pop();
        i = close === -1 ? code.length : close + 1;
      } else if (c === '<' && next === '>') {
        stack.push({ kind: 'children' });
        i += 2;
      } else if (c === '<') {
        const end = openTag(i + 1, i);
        i = end === -1 ? i + 1 : end;
      } else i++;
    }
  }
  if (inserts.length === 0) return null;
  let out = '';
  let at = 0;
  for (const [index, text] of inserts) {
    out += code.slice(at, index) + text;
    at = index;
  }
  return out + code.slice(at);
}

/**
 * Does the stamped file still compile? Vite's own compiler says (oxc, else esbuild). `vite` is
 * the module when the config passed it in (Vite's config runner can't import it from here).
 */
async function compiles(code, file, given) {
  try {
    const vite = given ?? (await import('vite'));
    const lang = file.endsWith('.tsx') ? 'tsx' : 'jsx';
    if (typeof vite.transformWithOxc === 'function')
      await vite.transformWithOxc(code, file, { lang });
    else if (typeof vite.transformWithEsbuild === 'function')
      await vite.transformWithEsbuild(code, file, { loader: lang });
    else return false;
    return true;
  } catch {
    return false;
  }
}

/** Add `fitts()` to `plugins` in vite.config. Dev only; does nothing in a build. */
export default function fitts(opts = {}) {
  let root = process.cwd();
  return {
    name: 'fitts',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
    },
    async transform(code, id) {
      const file = id.split('?')[0];
      if (!/\.[jt]sx$/.test(file) || file.includes('/node_modules/')) return null;
      const stamped = stamp(code, relative(root, file).split('\\').join('/'));
      if (!stamped || !(await compiles(stamped, file, opts.vite))) return null;
      // Stamps go on the same line as the tag, so line numbers in errors stay right.
      return { code: stamped, map: null };
    },
  };
}
