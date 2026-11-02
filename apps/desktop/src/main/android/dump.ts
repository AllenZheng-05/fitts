// A `uiautomator dump` (SPEC-phase4 §9.2) parsed into Android nodes and the agent's snapshot.
// The XML is flat and regular (one <node> per view, attributes only), so a small tokenizer reads
// it without an XML dependency. Pure.
import { sayable, type AndroidNode } from '@fitts/probes';
import type { AxNode, AxSnapshot } from '../../agent/protocol';

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#10;': '\n',
};
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|apos|#10);/g, (m) => ENTITIES[m] ?? m);

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1] ?? ''] = decode(m[2] ?? '');
  return out;
}

function bounds(s: string | undefined): AndroidNode['bounds'] {
  const m = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(s ?? '');
  if (!m) return { x: 0, y: 0, w: 0, h: 0 };
  const [x1, y1, x2, y2] = m.slice(1, 5).map(Number) as [number, number, number, number];
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}

/** The dump as a tree. Nodes without a resource-id get "a<n>", in document order. */
export function parseDump(xml: string): AndroidNode {
  const root: AndroidNode = {
    ref: 'root',
    cls: 'hierarchy',
    text: '',
    desc: '',
    bounds: { x: 0, y: 0, w: 0, h: 0 },
    clickable: false,
    focusable: false,
    enabled: true,
    children: [],
  };
  const stack: AndroidNode[] = [root];
  let n = 0;
  for (const m of xml.matchAll(/<node\b([^>]*?)(\/?)>|<\/node>/g)) {
    if (m[0] === '</node>') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const a = attrs(m[1] ?? '');
    const id = (a['resource-id'] ?? '').replace(/^.*:id\//, '');
    n += 1;
    const node: AndroidNode = {
      ref: id || `a${n}`,
      cls: a['class'] ?? '',
      text: a['text'] ?? '',
      desc: a['content-desc'] ?? '',
      bounds: bounds(a['bounds']),
      clickable: a['clickable'] === 'true' || a['long-clickable'] === 'true',
      focusable: a['focusable'] === 'true',
      enabled: a['enabled'] !== 'false',
      ...(a['checkable'] === 'true' ? { checked: a['checked'] === 'true' } : {}),
      children: [],
    };
    (stack[stack.length - 1] as AndroidNode).children.push(node);
    if (m[2] !== '/') stack.push(node);
  }
  return root;
}

/** The node's role, from its class (§9.2). */
export function roleOf(n: AndroidNode): string {
  const c = n.cls;
  if (/EditText/.test(c)) return 'textbox';
  if (/Switch/.test(c)) return 'switch';
  if (/CheckBox/.test(c)) return 'checkbox';
  if (/Button/.test(c)) return 'button';
  if (n.clickable) return 'button';
  if (/TextView/.test(c) || n.text.trim()) return 'text';
  if (/ImageView/.test(c)) return 'img';
  return 'generic';
}

const spokenText = (n: AndroidNode): string =>
  sayable(n.text) || sayable(n.desc) || n.children.map(spokenText).filter(Boolean).join(' ').trim();

/**
 * The agent's snapshot of a screen: the interactive nodes (and texts, for reading), with refs,
 * roles and names. `path` is the screen's route when the caller knows it.
 */
export function toSnapshot(
  root: AndroidNode,
  screen: { path: string; title: string },
  appId = 'app',
): AxSnapshot {
  const nodes: AxNode[] = [];
  const headings: string[] = [];
  const walk = (n: AndroidNode) => {
    const role = roleOf(n);
    if (n.clickable || role === 'textbox' || role === 'switch' || role === 'checkbox') {
      nodes.push({
        ref: n.ref,
        role,
        name: spokenText(n),
        ...(role === 'textbox' ? { value: n.text } : {}),
        ...(!n.enabled ? { disabled: true } : {}),
      });
      // Controls nested inside it (a quick-add button inside a tappable row) are controls too;
      // its own label isn't read again as page text.
      const nested = (c: AndroidNode) => {
        const r = roleOf(c);
        if (c.clickable || r === 'textbox' || r === 'switch' || r === 'checkbox') walk(c);
        else c.children.forEach(nested);
      };
      n.children.forEach(nested);
      return;
    }
    if (role === 'text' && n.text.trim() && headings.length < 3 && n.bounds.y < 400)
      headings.push(n.text.trim());
    n.children.forEach(walk);
  };
  walk(root);
  return {
    // android://<app>/<screen>: the app is the host, the screen the path (the agent reads both).
    url: `android://${appId}${screen.path}`,
    path: screen.path,
    title: screen.title,
    headings,
    nodes,
    hasPassword: false,
  };
}
