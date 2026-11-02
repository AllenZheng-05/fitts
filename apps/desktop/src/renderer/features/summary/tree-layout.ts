// The App Map's layout (SPEC-phase4 §8.3): a left-to-right tidy tree. Each depth is a column;
// leaves take the next row in order and a parent sits midway between its first and last child,
// so subtrees never overlap (the Reingold–Tilford property for a layered tree, without
// threads: rows are assigned in one pass). Filtering and collapsing happen first. Pure.
import type { AppMapNode } from '@fitts/schema';

export const COL = 210;
export const ROW = 58;
/** Groups with more children than this start collapsed. */
export const COLLAPSE_OVER = 12;

export interface Placed {
  node: AppMapNode;
  depth: number;
  x: number;
  y: number;
  parent?: string;
  /** Has children (shown or collapsed). */
  branch: boolean;
  expanded: boolean;
  /** Position among its siblings, 1-based, and how many (aria-posinset / setsize). */
  index: number;
  siblings: number;
}

export interface Layout {
  nodes: Placed[];
  edges: { from: string; to: string }[];
  width: number;
  height: number;
}

export type MapFilter = 'all' | 'findings' | 'unreached';

/** Does this node itself match the filter and the search text? */
function matches(n: AppMapNode, filter: MapFilter, search: string): boolean {
  const q = search.trim().toLowerCase();
  const text =
    !q ||
    n.path.toLowerCase().includes(q) ||
    n.label.toLowerCase().includes(q) ||
    (n.page?.features ?? []).some(
      (f) => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q),
    );
  if (!text) return false;
  if (filter === 'findings') return (n.page?.findings.length ?? 0) > 0;
  if (filter === 'unreached') return Boolean(n.page && !n.page.reached);
  return true;
}

/** The tree with only matching nodes and the paths to them (the root always stays). */
export function filterTree(root: AppMapNode, filter: MapFilter, search: string): AppMapNode {
  const keep = (n: AppMapNode): AppMapNode | null => {
    const children = n.children.map(keep).filter((c): c is AppMapNode => c !== null);
    if (children.length || matches(n, filter, search)) return { ...n, children };
    return null;
  };
  return keep(root) ?? { ...root, children: [] };
}

/** The paths that start collapsed: groups with more than COLLAPSE_OVER children. */
export function initiallyCollapsed(root: AppMapNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: AppMapNode) => {
    if (n.children.length > COLLAPSE_OVER) out.add(n.path);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

export function layoutTree(root: AppMapNode, collapsed: Set<string>): Layout {
  const nodes: Placed[] = [];
  const edges: { from: string; to: string }[] = [];
  let row = 0;
  let maxDepth = 0;
  const place = (
    n: AppMapNode,
    depth: number,
    parent: string | undefined,
    index: number,
    siblings: number,
  ): number => {
    maxDepth = Math.max(maxDepth, depth);
    const expanded = n.children.length > 0 && !collapsed.has(n.path);
    const at = nodes.length;
    nodes.push({
      node: n,
      depth,
      x: depth * COL,
      y: 0,
      ...(parent !== undefined ? { parent } : {}),
      branch: n.children.length > 0,
      expanded,
      index,
      siblings,
    });
    let y: number;
    if (expanded) {
      const ys = n.children.map((c, i) => {
        edges.push({ from: n.path, to: c.path });
        return place(c, depth + 1, n.path, i + 1, n.children.length);
      });
      y = ((ys[0] ?? 0) + (ys.at(-1) ?? 0)) / 2;
    } else {
      y = row * ROW;
      row += 1;
    }
    const placed = nodes[at];
    if (placed) placed.y = y;
    return y;
  };
  place(root, 0, undefined, 1, 1);
  return { nodes, edges, width: (maxDepth + 1) * COL, height: Math.max(1, row) * ROW };
}
