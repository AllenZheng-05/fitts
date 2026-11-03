// The report as one static HTML page: no scripts, no requests beyond its own folder. Every value
// is escaped here; the data was scrubbed in data.ts.
import { flattenMap, type AppMapNode } from '@fitts/schema';
import type { ChangeView, Figure, FindingView, ReportData } from './data';
import {
  changeStatus,
  confirmed,
  findingStatus,
  heuristics,
  lenses,
  modelName,
  phases,
  plural,
  providers,
  severityNames,
  tasks,
  tokens,
  usd,
} from './words';

export interface RenderOptions {
  /** On the Fitts site: links back to it. Left out for a report shared on its own. */
  site?: { home: string; runs: string };
  /** A line above the title saying what kind of run this is ("Our test app, planted issues"). */
  label?: string;
  /** When it was generated (tests pass a fixed date). */
  now?: Date;
  /** Let search engines index it (published runs); a shared export asks them not to. */
  index?: boolean;
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ESC[c] ?? c);

/** `**bold**` and `` `code` `` in Fitts's own lines, after escaping. */
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

const anchor = (id: string) => `f-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
const join = (parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join('');
const list = (items: string[], cls = '') =>
  items.length
    ? `<ul${cls ? ` class="${cls}"` : ''}>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`
    : '';

const dateText = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

const sevLabel = (n: number) => `Sev ${n} · ${severityNames[n] ?? ''}`;
const sevChip = (n: number) => `<span class="sev sev-${n}">${esc(sevLabel(n))}</span>`;

export function renderReport(d: ReportData, o: RenderOptions = {}): string {
  const s = d.stats;
  const title = `${d.project} · Fitts run report`;
  const description = `What Fitts found on ${d.project}: ${plural(s.shown, 'finding')}, ${s.verified} verified ${s.verified === 1 ? 'fix' : 'fixes'}, ${usd(s.spentUsd)} in model calls.`;
  const sections: { id: string; title: string; show: boolean }[] = [
    { id: 'understood', title: 'What Fitts understood', show: true },
    { id: 'map', title: 'App Map', show: true },
    { id: 'findings', title: `Findings (${s.shown})`, show: true },
    { id: 'suggestions', title: `Suggestions (${s.suggestions})`, show: d.suggestions.length > 0 },
    { id: 'owner-ok', title: 'You said this is fine', show: d.ownerOk.length > 0 },
    { id: 'changes', title: 'Other changes', show: d.otherChanges.length > 0 },
    { id: 'models', title: 'Which models did what', show: true },
    { id: 'cost', title: 'Cost per model call', show: true },
  ];
  const shown = sections.filter((x) => x.show);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${o.index ? '' : '<meta name="robots" content="noindex">\n'}<meta name="theme-color" content="#fbfaf7">
<link rel="stylesheet" href="report.css">
${o.site ? '<link rel="icon" type="image/svg+xml" href="/favicon.svg">\n' : ''}</head>
<body>
<a class="skip" href="#main">Skip to the report</a>
${o.site ? siteBar(o.site) : ''}<header class="top">
<div class="wrap">
<p class="eyebrow">${esc(o.label ?? 'Fitts run report')}</p>
<h1>${esc(d.project)}</h1>
<p class="meta">${esc(
    [
      `Run ${d.runId.replace(/^run-/, '')}`,
      dateText(d.startedAt),
      `${d.minutes} min`,
      plural(s.steps, 'step'),
      plural(s.pages, 'page'),
      d.framework,
    ]
      .filter(Boolean)
      .join(' · '),
  )}</p>
${d.brief ? `<blockquote class="brief"><p>${esc(d.brief)}</p><p class="who">The owner’s brief</p></blockquote>` : ''}
<dl class="stats">
${stat('Found', String(s.shown), s.suggestions ? `and ${plural(s.suggestions, 'suggestion')}` : '')}
${stat('Fixed and verified', String(s.verified), s.review ? `${s.review} checked by review` : '')}
${stat('Rolled back', String(s.rolledBack), '')}
${stat('Spent on models', usd(s.spentUsd), plural(s.calls, 'call'))}
</dl>
<p class="math">${esc(mathLine(d))}</p>
${d.otherChanges.length + d.findings.filter((f) => f.change).length === 0 ? '<p class="small">No fixes in this run: it ended before any were approved. Fitts asks before it changes code.</p>' : ''}
<nav aria-label="On this page" class="toc"><ul>${shown
    .map((x) => `<li><a href="#${x.id}">${esc(x.title)}</a></li>`)
    .join('')}</ul></nav>
</div>
</header>
<main id="main" class="wrap">
${understood(d)}
${mapSection(d.map)}
<section id="findings" aria-labelledby="findings-title">
<h2 id="findings-title">Findings</h2>
<p class="lead">Shown because the evidence was strong enough: a measurement, or reviewers agreeing. Most serious first.</p>
${d.findings.length ? d.findings.map((f) => findingArticle(f)).join('\n') : '<p>No findings were shown in this run.</p>'}
</section>
${d.suggestions.length ? lesser('suggestions', 'Suggestions', 'Not enough evidence to show as findings. Listed so nothing is hidden.', d.suggestions) : ''}
${d.ownerOk.length ? lesser('owner-ok', 'You said this is fine', 'The owner said these aren’t problems on an earlier run, so Fitts didn’t raise them.', d.ownerOk) : ''}
${d.otherChanges.length ? `<section id="changes" aria-labelledby="changes-title"><h2 id="changes-title">Other changes</h2>${d.otherChanges.map((c) => `<div class="card">${changeBlock(c, 'h3')}</div>`).join('')}</section>` : ''}
${modelsSection(d)}
${costSection(d)}
</main>
<footer class="foot">
<div class="wrap">
<p>Generated by Fitts from the run’s own log on ${esc(dateText((o.now ?? new Date()).toISOString()))}. Screens and text are the site as Fitts saw it.${d.priceTable ? ` Costs are estimates from Fitts’s price table of ${esc(d.priceTable)}.` : ''}</p>
<p>The model that writes a fix never grades it: a measurement runs again, or a reviewer looks, and the project’s own checks decide.</p>
</div>
</footer>
</body>
</html>
`;
}

function siteBar(site: NonNullable<RenderOptions['site']>) {
  return `<nav class="bar" aria-label="Fitts site"><div class="wrap bar-in"><a class="brand" href="${esc(site.home)}" aria-label="Fitts, home">${MARK}<span aria-hidden="true">Fitts</span></a><a class="bar-link" href="${esc(site.runs)}">All runs</a></div></nav>
`;
}

/** The Fitts mark, paths as in apps/site's brand.tsx (colors from the tokens). */
const MARK =
  '<svg aria-hidden="true" viewBox="0 0 64 64" width="28" height="28"><path d="M10 18 V 8 H 20" class="m-cobalt" stroke-width="2"/><path d="M54 46 V 56 H 44" class="m-cobalt" stroke-width="2"/><path d="M38 15 C 30 13, 27 18, 27 25 V 49" class="m-ink" stroke-width="7"/><path d="M19 31 H 35" class="m-ink" stroke-width="7"/><circle cx="45" cy="31" r="5.5" class="m-coral"/><rect x="6.5" y="4.5" width="7" height="7" class="m-handle" stroke-width="2"/><rect x="50.5" y="52.5" width="7" height="7" class="m-handle" stroke-width="2"/></svg>';

function stat(label: string, value: string, note: string) {
  return `<div class="stat"><dt>${esc(label)}</dt><dd><span class="num">${esc(value)}</span>${note ? `<span class="note">${esc(note)}</span>` : ''}</dd></div>`;
}

export function mathLine(d: ReportData): string {
  const s = d.stats;
  const parts = [
    `${s.verified} fixed and verified`,
    s.review ? `${s.review} checked by review` : '',
    s.rolledBack ? `${s.rolledBack} rolled back` : '',
    s.undone ? `${s.undone} undone` : '',
    s.dismissed ? `${s.dismissed} not a problem` : '',
    s.open ? `${s.open} open` : '',
  ].filter(Boolean);
  return `${plural(s.shown, 'finding')} shown: ${parts.join(', ')}.`;
}

function understood(d: ReportData) {
  const u = d.understood;
  const rows = [
    u
      ? `<p>${esc(u.summary)}</p><p class="small">From the code at commit <code>${esc(u.commit.slice(0, 12))}</code>${u.modeled ? ', read by a model' : ', from the code alone (no model)'}.</p>`
      : '<p>This run has no App Model: Fitts went by what it could reach.</p>',
    d.journeys.length
      ? `<h3>Journeys</h3>${list(
          d.journeys.map(
            (j) =>
              `${esc(j.name)} <span class="chip">${esc(j.status)}</span>${j.reason ? ` <span class="small">${esc(j.reason)}</span>` : ''}`,
          ),
        )}`
      : '',
    d.cells.length
      ? `<h3>Screens checked</h3><p>${d.cells.map((c) => `<span class="chip">${esc(c)}</span>`).join(' ')}</p>`
      : '',
    `<p class="small">${esc(`Tried ${d.stats.controls.done} of ${d.stats.controls.total} controls over ${plural(d.stats.steps, 'step')}.`)}</p>`,
  ];
  return `<section id="understood" aria-labelledby="understood-title"><h2 id="understood-title">What Fitts understood</h2><div class="card prose">${join(rows)}</div></section>`;
}

function mapSection(root: AppMapNode) {
  const pages = flattenMap(root).filter((x) => x.node.page).length;
  return `<section id="map" aria-labelledby="map-title"><h2 id="map-title">App Map</h2>
<p class="lead">${esc(plural(pages, 'page'))}, grouped by address: what each does, what Fitts found there and what it fixed.</p>
<div class="card map">${tree([root])}</div></section>`;
}

function tree(nodes: AppMapNode[]): string {
  if (!nodes.length) return '';
  return `<ul class="tree">${nodes
    .map((n) => {
      const p = n.page;
      const tally = n.totals.findings
        ? `${n.totals.findings} found · ${n.totals.fixed} fixed${n.children.length ? ' (with the pages under it)' : ''}`
        : p
          ? 'nothing found'
          : '';
      const state =
        p && !p.reached
          ? `<span class="chip">not reached${p.why ? `: ${esc(p.why)}` : ''}</span>`
          : '';
      const shown = (p?.findings ?? []).filter((f) => (f.lane ?? 'shown') === 'shown');
      const details = p
        ? join([
            p.features.length
              ? `<p class="small">Does: ${p.features.map((f) => esc(f.name)).join(' · ')}</p>`
              : '',
            shown.length
              ? `<details><summary>${esc(plural(shown.length, 'finding'))} here</summary>${list(
                  [...shown]
                    .sort((a, b) => b.severity - a.severity)
                    .map(
                      (f) =>
                        `<a href="#${anchor(f.id)}">${esc(f.title)}</a> <span class="small">${esc(sevLabel(f.severity))}</span>`,
                    ),
                )}</details>`
              : '',
            p.changes.filter((c) => c.status === 'verified').length
              ? list(
                  p.changes
                    .filter((c) => c.status === 'verified')
                    .map((c) => `Fixed: ${esc(c.title)}`),
                  'small',
                )
              : '',
          ])
        : '';
      return `<li><div class="node"><code>${esc(n.path)}</code>${n.instances ? ` <span class="small">× ${n.instances} pages</span>` : ''}${n.label && n.label !== n.path.split('/').pop() && n.path !== '/' ? ` <span>${esc(n.label)}</span>` : ''}${tally ? ` <span class="tally">${esc(tally)}</span>` : ''} ${state}</div>${details}${tree(n.children)}</li>`;
    })
    .join('')}</ul>`;
}

function figure(f: Figure, caption?: string) {
  const { width: W, height: H, box } = f;
  const marks = (sw: number) =>
    join([
      f.outline ? `<path d="${esc(f.outline)}" class="outline" stroke-width="${sw}"/>` : '',
      box && !f.outline
        ? `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" class="box" stroke-width="${sw}"/>`
        : '',
    ]);
  const svg = (viewBox: string, label: string, sw: number, cls: string) =>
    `<div class="frame"><svg class="${cls}" viewBox="${viewBox}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet"><image href="${esc(f.src)}" x="0" y="0" width="${W}" height="${H}"/>${marks(sw)}</svg></div>`;
  if (!box) {
    return `<figure class="shot">${svg(`0 0 ${W} ${H}`, f.alt, Math.max(3, W / 300), 'whole')}${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
  }
  // The zoom: the element with room around it, at least a third of the page wide.
  const w = Math.min(W, Math.max(box.width / 0.55, W / 3));
  const h = Math.min(H, Math.max(box.height / 0.55, w * 0.55));
  const x = clamp(box.left + box.width / 2 - w / 2, 0, W - w);
  const y = clamp(box.top + box.height / 2 - h / 2, 0, H - h);
  const r = (n: number) => Math.round(n * 10) / 10;
  return `<figure class="shot"><div class="pair"><div><p class="small">Close up</p>${svg(`${r(x)} ${r(y)} ${r(w)} ${r(h)}`, `${f.alt} (close up)`, Math.max(2, w / 220), 'zoom')}</div><div><p class="small">The whole page</p>${svg(`0 0 ${W} ${H}`, f.alt, Math.max(3, W / 300), 'whole')}</div></div>${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

function findingArticle(f: FindingView) {
  const id = anchor(f.id);
  const a = f.agreement;
  const who = [
    a.agreeing
      ? `${a.agreeing} of ${a.total} reviewers${a.who.length ? ` (${a.who.join(', ')})` : ''}`
      : '',
    a.measured ? 'one of Fitts’s own measurements' : '',
  ].filter(Boolean);
  const noticed = f.noticed.map(
    (n) =>
      `${inline(n.text)} <span class="small">step ${n.step} · <code>${esc(n.route)}</code></span>`,
  );
  const status = f.change ? changeStatus[f.change.status] : (findingStatus[f.status] ?? f.status);
  return `<article id="${id}" class="finding card" aria-labelledby="${id}-t">
<header>
<p class="chips">${sevChip(f.severity)}${f.heuristic ? ` <span class="chip" title="${esc(heuristics[f.heuristic])}">${esc(f.heuristic)} · ${esc(heuristics[f.heuristic])}</span>` : ''} <span class="chip">${esc(lenses[f.lens])}</span> <span class="chip ${f.change?.status === 'verified' ? 'chip-good' : ''}">${esc(status)}</span></p>
<h3 id="${id}-t">${esc(f.title)}</h3>
<p class="where">On <code>${esc(f.route)}</code>${f.alsoOn.length ? `, and ${plural(f.alsoOn.length, 'other page')}: ${f.alsoOn.map((r) => `<code>${esc(r)}</code>`).join(' ')}` : ''}${f.seenOn ? ` · seen at ${esc(f.seenOn)}` : ''}${f.source ? ` · in <code>${esc(f.source)}</code>` : ''}</p>
</header>
<div class="prose">
${f.finding ? `<p>${inline(f.finding)}</p>` : ''}
${f.fix ? `<p><strong>The fix Fitts suggests:</strong> ${inline(f.fix)}</p>` : ''}
${f.ownerReason ? `<p><strong>The owner said:</strong> ${esc(f.ownerReason)}</p>` : ''}
</div>
${f.figure ? figure(f.figure) : ''}
${f.moment ? `<h4>The moment</h4><div class="pair">${figure(f.moment.before, f.moment.before.alt)}${figure(f.moment.after, f.moment.after.alt)}</div>` : ''}
<h4>Who flagged it</h4>
<p>${who.length ? esc(who.join(', and ')) : 'Fitts alone.'}</p>
${noticed.length ? `<h4>What Fitts noticed</h4>${noticed.length > 8 ? `${list(noticed.slice(0, 6), 'noticed')}<details><summary>${esc(plural(noticed.length - 6, 'more line'))}</summary>${list(noticed.slice(6), 'noticed')}</details>` : list(noticed, 'noticed')}` : ''}
${f.evidence.length ? `<h4>Evidence</h4>${list(f.evidence.map(inline))}` : ''}
${repro(f)}
${f.playwright ? `<details class="code"><summary>The Playwright test Fitts wrote</summary><pre tabindex="0" aria-label="Playwright test for ${esc(f.title)}"><code>${esc(f.playwright)}</code></pre></details>` : ''}
${fixBlock(f)}
</article>`;
}

function repro(f: FindingView) {
  const r = f.repro;
  if (!r) {
    if (!f.path.length) return '';
    return `<h4>How Fitts got there</h4><ol>${f.path.map((p) => `<li>${inline(p.label)}</li>`).join('')}</ol>`;
  }
  return `<h4>See it yourself</h4>
<p class="small">Start at <code>${esc(r.start)}</code> on ${esc(r.device)}. <span class="chip ${r.confirmed === 'replayed' ? 'chip-good' : ''}">${esc(confirmed[r.confirmed])}</span></p>
<ol class="steps">${r.steps
    .map(
      (st) =>
        `<li>${inline(st.text)}${st.shot ? ` <a class="small" href="${esc(st.shot.src)}">the page at this step</a>` : ''}</li>`,
    )
    .join('')}</ol>
<dl class="pairs"><div><dt>Expected</dt><dd>${inline(r.expected)}</dd></div><div><dt>Actual</dt><dd>${inline(r.actual)}</dd></div><div><dt>Environment</dt><dd>${esc(r.environment)}</dd></div>${
    r.wcag.length
      ? `<div><dt>WCAG</dt><dd>${r.wcag.map((w) => `<a href="${esc(safeUrl(w.url))}">${esc(w.sc)} ${esc(w.name)}</a>`).join(', ')}</dd></div>`
      : ''
  }${r.rule ? `<div><dt>axe rule</dt><dd><a href="${esc(safeUrl(r.rule.url))}">${esc(r.rule.id)}</a></dd></div>` : ''}</dl>`;
}

const safeUrl = (u: string) => (/^https:\/\//.test(u) ? u : '#');

function fixBlock(f: FindingView) {
  if (!f.change && !f.diff) return '';
  return `<div class="fix">${f.change ? changeBlock(f.change, 'h4') : '<h4>The fix</h4>'}${f.diff ? diff(f.diff) : ''}</div>`;
}

function changeBlock(c: ChangeView, h: 'h3' | 'h4') {
  const tone = c.status === 'verified' ? 'chip-good' : '';
  return join([
    `<${h}>${c.kind === 'redesign' ? esc(c.title) : 'The fix'} <span class="chip ${tone}">${esc(changeStatus[c.status])}</span></${h}>`,
    list(c.evidence.map(inline)),
    c.after ? `<p><a href="${esc(c.after.src)}">${esc(c.after.alt)}</a></p>` : '',
    c.pages.length
      ? list(
          c.pages.map(
            (p) =>
              `<code>${esc(p.route)}</code>: ${join([
                p.before ? `<a href="${esc(p.before.src)}">before</a>` : '',
                p.before && p.after ? ' · ' : '',
                p.after ? `<a href="${esc(p.after.src)}">after</a>` : '',
              ])}`,
          ),
        )
      : '',
    `<p class="small">${esc(
      [
        `Cost ${usd(c.costUsd)}`,
        c.attempts && c.attempts > 1 ? `${c.attempts} passes` : '',
        c.branch ? `branch ${c.branch}` : '',
        c.sha ? `commit ${c.sha.slice(0, 7)}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    )}${c.prUrl ? ` · <a href="${esc(c.prUrl)}">pull request #${esc(c.prNumber ?? '')}</a>` : c.prNumber ? ` · pull request #${esc(c.prNumber)}` : ''}</p>`,
  ]);
}

function diff(d: NonNullable<FindingView['diff']>) {
  return `<p class="small">The diff, in ${d.files.map((f) => `<code>${esc(f)}</code>`).join(', ')}</p><pre class="diff" tabindex="0" aria-label="The diff">${d.lines
    .map(
      (l) =>
        `<span class="${l.kind}"><span class="sign" aria-hidden="true">${l.kind === 'add' ? '+' : '−'}</span><span class="visually-hidden">${l.kind === 'add' ? 'added: ' : 'removed: '}</span>${esc(l.text)}</span>`,
    )
    .join('\n')}</pre>`;
}

function lesser(id: string, title: string, lead: string, items: FindingView[]) {
  return `<section id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${esc(title)}</h2><p class="lead">${esc(lead)}</p><div class="card">${list(
    items.map(
      (f) =>
        `${sevChip(f.severity)} <strong>${esc(f.title)}</strong> <span class="small">on <code>${esc(f.route)}</code></span><br><span class="small">${inline(f.finding)}</span>`,
    ),
    'lesser',
  )}</div></section>`;
}

function modelsSection(d: ReportData) {
  const rows = d.models.map(
    (m) =>
      `<tr><th scope="row">${esc(modelName(m.model))}<span class="small block">${esc(providers[m.provider])}</span></th><td>${esc(m.tasks.map((t) => tasks[t]).join(', '))}</td><td class="n">${m.calls}</td><td class="n">${esc(tokens(m.inputTokens))} / ${esc(tokens(m.outputTokens))}</td><td class="n">${esc(usd(m.usd))}</td></tr>`,
  );
  return `<section id="models" aria-labelledby="models-title"><h2 id="models-title">Which models did what</h2>
<p class="lead">Every model call in this run, grouped by model. The model that writes a fix never grades it.</p>
${
  rows.length
    ? `<div class="table" role="region" aria-label="Model calls, by model" tabindex="0"><table><thead><tr><th scope="col">Model</th><th scope="col">Its jobs here</th><th scope="col" class="n">Calls</th><th scope="col" class="n">Tokens in / out</th><th scope="col" class="n">Cost</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : '<p>No model calls were logged.</p>'
}
</section>`;
}

function costSection(d: ReportData) {
  const start = new Date(d.startedAt).getTime();
  const clock = (ts: string) => {
    const s = Math.max(0, Math.round((new Date(ts).getTime() - start) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const shownIds = new Set(d.findings.map((f) => f.id));
  const rows = d.ledger.map(
    (e, i) =>
      `<tr><td class="n">${i + 1}</td><td class="n">${clock(e.ts)}</td><td>${esc(tasks[e.task])}</td><td>${esc(modelName(e.model))}</td><td class="n">${esc(tokens(e.inputTokens))}${e.cachedTokens ? ` <span class="small">(${esc(tokens(e.cachedTokens))} cached)</span>` : ''}</td><td class="n">${esc(tokens(e.outputTokens))}</td><td class="n">${esc(usd(e.usd))}</td><td class="n">${e.latencyMs ? `${(e.latencyMs / 1000).toFixed(1)} s` : ''}</td><td>${e.findingId && shownIds.has(e.findingId) ? `<a href="#${anchor(e.findingId)}">finding</a>` : ''}</td></tr>`,
  );
  const phaseRows = (Object.keys(phases) as (keyof typeof phases)[])
    .filter((k) => d.byPhase[k] > 0)
    .map((k) => `<li>${esc(phases[k])}: ${esc(usd(d.byPhase[k]))}</li>`);
  return `<section id="cost" aria-labelledby="cost-title"><h2 id="cost-title">Cost per model call</h2>
<p class="lead">${esc(`${usd(d.stats.spentUsd)} in all${d.stats.capUsd ? ` (the run’s cap was ${usd(d.stats.capUsd)})` : ''}. Time is minutes into the run.`)}</p>
${phaseRows.length ? `<ul class="phases">${phaseRows.join('')}</ul>` : ''}
${
  rows.length
    ? `<div class="table" role="region" aria-label="Every model call, in order" tabindex="0"><table><thead><tr><th scope="col" class="n">#</th><th scope="col" class="n">Time</th><th scope="col">For</th><th scope="col">Model</th><th scope="col" class="n">In</th><th scope="col" class="n">Out</th><th scope="col" class="n">Cost</th><th scope="col" class="n">Took</th><th scope="col"><span class="visually-hidden">Finding</span></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : ''
}
</section>`;
}
