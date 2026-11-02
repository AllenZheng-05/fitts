// The App Map on Done (SPEC-phase4 §8.3): every page of the app as a tree, left to right, with
// what each page does, what Fitts checked, found and fixed there. Nodes are real buttons in an
// ARIA tree (arrow keys, Home/End, type-ahead); the edges are decoration. The map pans and
// zooms inside its panel; a node opens the page drawer.
import {
  appMap,
  matchesTemplate,
  type AppMapNode,
  type RunState,
  type Severity,
} from '@fitts/schema';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { Button } from '../../components/Button';
import { FilterChip } from '../../components/Chip';
import { IconButton } from '../../components/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import { TextField } from '../../components/fields';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';
import { format } from '../../lib/format';
import { severityTone } from '../../lib/severity';
import { getEngine } from '../../state/engine';
import { useUi } from '../../state/ui';
import {
  filterTree,
  initiallyCollapsed,
  layoutTree,
  type MapFilter,
  type Placed,
} from './tree-layout';

const NODE_W = 170;
const NODE_H = 44;
const PAD = 24;

export function AppMap({ run }: { run: RunState }) {
  const m = copy.done.map;
  const root = useMemo(() => appMap(run), [run]);
  const [filter, setFilter] = useState<MapFilter>('all');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(() => initiallyCollapsed(root));
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState(root.path);
  const [journey, setJourney] = useState<string | null>(null);
  const [hoverJourney, setHoverJourney] = useState<string | null>(null);
  const [view, setView] = useState({ x: PAD, y: PAD, scale: 1 });
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const typed = useRef({ text: '', at: 0 });
  const keyboard = useRef(false);

  const shown = useMemo(() => filterTree(root, filter, search), [root, filter, search]);
  const layout = useMemo(() => layoutTree(shown, collapsed), [shown, collapsed]);
  const byPath = useMemo(() => new Map(layout.nodes.map((p) => [p.node.path, p])), [layout]);
  const journeys = useMemo(
    () => run.appModel?.journeys.filter((j) => j.enabled !== false) ?? [],
    [run.appModel],
  );
  const lit = hoverJourney ?? journey;
  const litPages = useMemo(() => {
    const j = journeys.find((x) => x.id === lit);
    if (!j) return [] as string[];
    const order = [j.start, ...j.pages].map(
      (p) =>
        layout.nodes.find((n) => n.node.path === p || matchesTemplate(n.node.path, p))?.node.path,
    );
    return order.filter((p, i): p is string => p !== undefined && order.indexOf(p) === i);
  }, [journeys, lit, layout]);

  // The focused node stays one that's shown.
  const current = byPath.has(focused) ? focused : root.path;
  useEffect(() => {
    if (keyboard.current) buttons.current.get(current)?.focus();
    keyboard.current = false;
  }, [current]);

  const toggle = (path: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const move = (to: string | undefined) => {
    if (!to) return;
    keyboard.current = true;
    setFocused(to);
  };

  const onKey = (e: KeyboardEvent, p: Placed) => {
    const i = layout.nodes.findIndex((n) => n.node.path === p.node.path);
    const at = (k: number) => layout.nodes[k]?.node.path;
    switch (e.key) {
      case 'ArrowDown':
        move(at(i + 1));
        break;
      case 'ArrowUp':
        move(at(i - 1));
        break;
      case 'ArrowRight':
        if (p.branch && !p.expanded) toggle(p.node.path);
        else if (p.expanded) move(p.node.children[0]?.path);
        else return;
        break;
      case 'ArrowLeft':
        if (p.expanded) toggle(p.node.path);
        else move(p.parent);
        break;
      case 'Home':
        move(at(0));
        break;
      case 'End':
        move(at(layout.nodes.length - 1));
        break;
      case 'Enter':
      case ' ':
        setSelected(p.node.path);
        break;
      default: {
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        const now = e.timeStamp;
        typed.current = {
          text: (now - typed.current.at < 600 ? typed.current.text : '') + e.key.toLowerCase(),
          at: now,
        };
        const q = typed.current.text;
        const after = [...layout.nodes.slice(i + 1), ...layout.nodes.slice(0, i + 1)];
        move(after.find((n) => n.node.label.toLowerCase().startsWith(q))?.node.path);
        break;
      }
    }
    e.preventDefault();
  };

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) {
      const scale = Math.min(2, Math.max(0.4, view.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
      setView({ ...view, scale });
    } else setView({ ...view, x: view.x - e.deltaX, y: view.y - e.deltaY });
  };
  const zoom = (f: number) =>
    setView((v) => ({ ...v, scale: Math.min(2, Math.max(0.4, v.scale * f)) }));

  const center = (p: Placed) => ({ x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 });
  const sel = selected ? (byPath.get(selected)?.node ?? null) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex flex-none flex-wrap items-end gap-2.5">
        <SegmentedControl
          label={m.filterLabel}
          selected={filter}
          onSelect={(id) => setFilter(id as MapFilter)}
          segments={[
            { id: 'all', label: m.filters.all },
            { id: 'findings', label: m.filters.findings },
            { id: 'unreached', label: m.filters.unreached },
          ]}
        />
        <TextField
          label={m.search}
          hideLabel
          placeholder={m.searchPlaceholder}
          size="md"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-45 flex-1"
        />
        <div className="flex gap-1.5">
          <IconButton
            icon={<span aria-hidden>−</span>}
            aria-label={m.zoomOut}
            size="sm"
            onClick={() => zoom(0.85)}
          />
          <IconButton
            icon={<span aria-hidden>+</span>}
            aria-label={m.zoomIn}
            size="sm"
            onClick={() => zoom(1.15)}
          />
          <Button size="sm" onClick={() => setView({ x: PAD, y: PAD, scale: 1 })}>
            {m.fit}
          </Button>
        </div>
      </div>
      {journeys.length > 0 && (
        <div
          role="group"
          aria-label={m.journeys}
          className="flex flex-none flex-wrap items-center gap-1.5"
        >
          <span className="text-[12px] font-bold">{m.journeys}</span>
          {journeys.map((j) => (
            <FilterChip
              key={j.id}
              pressed={journey === j.id}
              onClick={() => setJourney(journey === j.id ? null : j.id)}
              onMouseEnter={() => setHoverJourney(j.id)}
              onMouseLeave={() => setHoverJourney(null)}
              onFocus={() => setHoverJourney(j.id)}
              onBlur={() => setHoverJourney(null)}
            >
              {j.name}
            </FilterChip>
          ))}
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-2.5">
        <div
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-card border border-ink bg-paper"
          onWheel={onWheel}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              width: layout.width,
              height: layout.height,
            }}
          >
            <svg
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 overflow-visible"
              width={layout.width}
              height={layout.height}
            >
              {layout.edges.map((e) => {
                const a = byPath.get(e.from);
                const b = byPath.get(e.to);
                if (!a || !b) return null;
                const x1 = a.x + NODE_W;
                const y1 = a.y + NODE_H / 2;
                const x2 = b.x;
                const y2 = b.y + NODE_H / 2;
                const mid = (x1 + x2) / 2;
                return (
                  <path
                    key={`${e.from}>${e.to}`}
                    d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                    fill="none"
                    className="stroke-ink-faint"
                    strokeWidth={1.5}
                  />
                );
              })}
              {litPages.length > 1 && (
                <polyline
                  points={litPages
                    .map((p) => byPath.get(p))
                    .filter((p): p is Placed => p !== undefined)
                    .map((p) => `${center(p).x},${center(p).y}`)
                    .join(' ')}
                  fill="none"
                  className="stroke-cobalt"
                  strokeWidth={3}
                  strokeDasharray="6 5"
                />
              )}
            </svg>
            <div
              role="tree"
              aria-label={m.title}
              className="relative"
              style={{ width: layout.width, height: layout.height }}
            >
              {layout.nodes.map((p) => (
                <MapNode
                  key={p.node.path}
                  placed={p}
                  current={p.node.path === current}
                  selected={p.node.path === selected}
                  lit={litPages.includes(p.node.path)}
                  register={(el) => {
                    if (el) buttons.current.set(p.node.path, el);
                    else buttons.current.delete(p.node.path);
                  }}
                  onSelect={() => {
                    setFocused(p.node.path);
                    setSelected(p.node.path === selected ? null : p.node.path);
                  }}
                  onFocus={() => setFocused(p.node.path)}
                  onToggle={() => toggle(p.node.path)}
                  onKeyDown={(e) => onKey(e, p)}
                />
              ))}
            </div>
          </div>
        </div>
        {sel && (
          <PageDrawer
            run={run}
            node={sel}
            root={sel.path === root.path}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

function MapNode({
  placed: p,
  current,
  selected,
  lit,
  register,
  onSelect,
  onFocus,
  onToggle,
  onKeyDown,
}: {
  placed: Placed;
  current: boolean;
  selected: boolean;
  lit: boolean;
  register: (el: HTMLButtonElement | null) => void;
  onSelect: () => void;
  onFocus: () => void;
  onToggle: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
}) {
  const m = copy.done.map;
  const n = p.node;
  const page = n.page;
  const reached = page?.reached ?? true;
  const t = n.totals;
  const summary = [
    page ? (reached ? m.reached : m.notReached) : m.group,
    t.findings ? format(m.foundN, { n: t.findings }) : '',
    t.fixed ? format(m.fixedN, { n: t.fixed }) : '',
    n.instances ? format(m.pagesN, { n: n.instances }) : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <div
      role="treeitem"
      aria-level={p.depth + 1}
      aria-posinset={p.index}
      aria-setsize={p.siblings}
      aria-selected={selected}
      {...(p.branch ? { 'aria-expanded': p.expanded } : {})}
      className="absolute flex items-center"
      style={{ left: p.x, top: p.y, width: NODE_W + (p.branch ? 26 : 0), height: NODE_H }}
    >
      <button
        ref={register}
        type="button"
        tabIndex={current ? 0 : -1}
        onClick={onSelect}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        className={cx(
          'flex h-full min-w-0 flex-1 items-center gap-2 rounded-control border bg-card px-2.5 text-left text-[13px] transition-tint',
          selected ? 'border-2 border-ink' : 'border-ink',
          lit && 'bg-cobalt-tint',
          !selected && !lit && 'hover:bg-paper',
        )}
        style={{ width: NODE_W }}
      >
        <span
          aria-hidden
          className={cx(
            'size-2.5 flex-none rounded-pill border-[1.5px] border-ink',
            page && reached && 'bg-mint',
          )}
        />
        <span className="min-w-0 flex-1 truncate font-semibold">
          {n.label}
          <span className="sr-only">{`, ${n.path}, ${summary}`}</span>
        </span>
        <span aria-hidden className="flex flex-none gap-1">
          {t.findings > 0 && (
            <span
              className={cx(
                'rounded-pill px-1.5 text-[11px] font-bold',
                severityTone(Math.max(1, t.worst) as Severity),
              )}
            >
              {t.findings}
            </span>
          )}
          {t.fixed > 0 && (
            <span className="rounded-pill bg-mint-tint px-1.5 text-[11px] font-bold text-mint-ink">
              {t.fixed}
            </span>
          )}
          {n.instances !== undefined && (
            <span className="rounded-pill bg-neutral-tint px-1.5 text-[11px] font-bold text-neutral-ink">
              ×{n.instances}
            </span>
          )}
        </span>
      </button>
      {p.branch && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={format(p.expanded ? m.collapse : m.expand, { page: n.label })}
          onClick={onToggle}
          className="ml-1 size-6 flex-none rounded-pill border border-ink bg-card text-[12px] leading-none"
        >
          <span aria-hidden>{p.expanded ? '−' : '+'}</span>
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-[13px] font-bold">{title}</h4>
      {children}
    </section>
  );
}

/** The page drawer (SPEC-phase4 §8.3): what the page does and everything Fitts did there. */
function PageDrawer({
  run,
  node,
  root,
  onClose,
}: {
  run: RunState;
  node: AppMapNode;
  root: boolean;
  onClose: () => void;
}) {
  const m = copy.done.map;
  const page = node.page;
  const openId = useUi((s) => s.openFindingId);
  const observations = (run.observations ?? []).filter(
    (o) => o.route === node.path || matchesTemplate(node.path, o.route),
  );
  return (
    <aside
      aria-label={format(m.drawer, { page: node.label })}
      className="flex w-75 flex-none flex-col gap-3 overflow-y-auto rounded-card border border-ink bg-card p-3.5 text-[13px]"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[17px] font-bold">{node.label}</h3>
          <span className="font-mono text-[12px] text-muted">{node.path}</span>
        </div>
        <Button size="inline" onClick={onClose}>
          {m.close}
        </Button>
      </div>
      {root && run.appModel?.summary && (
        <Section title={m.about}>
          <p>{run.appModel.summary}</p>
          <p className="text-muted">
            {format(m.totals, {
              found: node.totals.findings,
              fixed: node.totals.fixed,
              open: node.totals.open,
            })}
          </p>
        </Section>
      )}
      {!page && <p className="text-muted">{m.groupHint}</p>}
      {page && page.features.length > 0 && (
        <Section title={m.does}>
          <ul className="flex flex-col gap-1">
            {page.features.map((f) => (
              <li key={f.name}>
                <span className="font-semibold">{f.name}</span>
                {f.description ? <span className="text-muted"> · {f.description}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {page && page.journeys.length > 0 && (
        <Section title={m.journeysHere}>
          <ul className="flex flex-col gap-1">
            {page.journeys.map((j) => (
              <li key={j.id}>
                {j.name}{' '}
                <span className="text-muted">
                  · {m.journeyStatus[j.status as keyof typeof m.journeyStatus] ?? j.status}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {page && page.cells.length > 0 && (
        <Section title={m.checkedAt}>
          <p>{page.cells.join(', ')}</p>
        </Section>
      )}
      {page && !page.reached && (
        <Section title={m.notChecked}>
          <p>{page.why ? (m.why[page.why as keyof typeof m.why] ?? page.why) : m.why.unknown}</p>
        </Section>
      )}
      {page && page.findings.length > 0 && (
        <Section title={format(m.found, { n: page.findings.length })}>
          <ul className="flex flex-col gap-1">
            {page.findings.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  aria-pressed={openId === f.id}
                  onClick={() =>
                    useUi.getState().set({ openFindingId: openId === f.id ? null : f.id })
                  }
                  className="flex w-full items-center gap-2 rounded-row px-1.5 py-1 text-left hover:bg-paper"
                >
                  <span
                    className={cx(
                      'rounded-pill px-1.5 text-[11px] font-bold',
                      severityTone(f.severity as Severity),
                    )}
                  >
                    {f.severity}
                  </span>
                  <span className="min-w-0 flex-1">{f.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {page && page.changes.length > 0 && (
        <Section title={m.fixed}>
          <ul className="flex flex-col gap-1">
            {page.changes.map((c) => {
              const full = run.changes.find((x) => x.id === c.id);
              return (
                <li key={c.id}>
                  {c.title}{' '}
                  <span className="text-muted">
                    · {m.changeStatus[c.status]}
                    {full?.sha ? ` · ${full.sha.slice(0, 7)}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {page && page.proposed.length > 0 && (
        <Section title={m.proposed}>
          <ul className="flex flex-col gap-2">
            {page.proposed.map((p) => (
              <li key={p.findingId} className="flex flex-col gap-1">
                <span>{p.fix}</span>
                <Button
                  size="sm"
                  className="self-start"
                  onClick={() => getEngine().approveFixes(run.projectId, [p.findingId])}
                >
                  {m.fixThis}
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {observations.length > 0 && (
        <Section title={m.noticed}>
          <ul className="flex flex-col gap-1 text-muted">
            {observations.slice(0, 12).map((o) => (
              <li key={o.id}>{o.text.replace(/\*\*/g, '')}</li>
            ))}
          </ul>
        </Section>
      )}
    </aside>
  );
}
