// A style board (SPEC-phase3 §2.1): one self-contained HTML page that shows what a direction's
// parts look like as components, in the owner's own words. Built by code from the library, never
// by a model. No scripts and no network: fonts arrive as data URIs where FONT_SLOT is (main
// fills it), pictures as data URIs in `art`.
import { contrast, CONTRAST_PAIRS } from './color';
import { cssVariables, part, type DesignSpec } from './index';
import type { DecorPart, DensityPart, MotionPart, ShapePart, TypePart } from './types';

/** Main replaces this with the board's @font-face rules (fonts embedded as data URIs). */
export const FONT_SLOT = '/*FITTS_FONTS*/';

/** The owner's words, from the crawl (§2.1), so the board reads like their site. */
export interface BoardWords {
  site: string;
  /** The site's real h1. */
  heading?: string;
  /** A line about the direction, in Fitts's words. */
  line?: string;
  /** A real button label and a real field label. */
  button?: string;
  field?: string;
  /** Up to 4 navigation labels. */
  nav?: string[];
}

/** Pictures from the image model (§2.2), as data URIs. Missing ones are simply left out. */
export interface BoardArt {
  hero?: string;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/** Six icons drawn in the shape language's line weight (§2.2: code, not a model). */
const ICONS: Record<string, string> = {
  Home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  Search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM16 16l5 5',
  Profile: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21a8 8 0 0 1 16 0',
  Saved: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  Messages: 'M4 5h16v11H8l-4 4z',
  Settings:
    'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
};

const icon = (d: string, stroke: number) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

const ROLE_NAMES: Record<string, string> = {
  bg: 'Background',
  surface: 'Surface',
  text: 'Text',
  muted: 'Muted text',
  border: 'Lines',
  accent: 'Accent',
  onAccent: 'On accent',
  accent2: 'Second accent',
};

export function buildBoard(spec: DesignSpec, words: BoardWords, art: BoardArt = {}): string {
  const shape = part(spec.parts.shape) as ShapePart | undefined;
  const type = part(spec.parts.type) as TypePart | undefined;
  const motion = part(spec.parts.motion) as MotionPart | undefined;
  const density = part(spec.parts.density) as DensityPart | undefined;
  const decors = spec.parts.decor
    .map((id) => part(id) as DecorPart | undefined)
    .filter((d): d is DecorPart => d?.kind === 'decor');
  const scale = type?.scale ?? [14, 16, 20, 28, 40, 56];
  const [small, body, , h3, h2, display] = [
    scale[0] ?? 14,
    scale[1] ?? 16,
    scale[2] ?? 20,
    scale[Math.max(0, scale.length - 4)] ?? 24,
    scale[Math.max(0, scale.length - 2)] ?? 40,
    scale[scale.length - 1] ?? 56,
  ];
  const space = density?.space ?? [8, 16, 24, 40, 64];
  const gap = space[2] ?? 24;
  const section = space[4] ?? space[space.length - 1] ?? 64;
  const [fast, slow] = motion?.duration ?? [150, 250];
  const easing = motion?.easing ?? 'ease';
  const stroke = /(\d+)px/.exec(shape?.border ?? '')?.[1] === '1' ? 1.5 : 2;
  const headingCase =
    type?.case === 'upper' ? 'uppercase' : type?.case === 'small-caps' ? 'none' : 'none';
  const p = spec.palette;
  const site = esc(words.site);
  const heading = esc(words.heading ?? words.site);
  const button = esc(words.button ?? 'Get started');
  const field = esc(words.field ?? 'Your email');
  const nav = (words.nav?.length ? words.nav : ['Home', 'About', 'Work', 'Contact'])
    .slice(0, 4)
    .map(esc);

  const swatches = (Object.keys(ROLE_NAMES) as (keyof typeof p)[])
    .map(
      (role) =>
        `<li class="swatch"><span class="chip" style="background:${p[role]}"></span><span><strong>${ROLE_NAMES[role]}</strong><br><code>${p[role]}</code></span></li>`,
    )
    .join('');
  const pairs = CONTRAST_PAIRS.map(([a, b, min]) => {
    const ratio = contrast(p[a], p[b]);
    return `<li><span class="pair" style="background:${p[b]};color:${p[a]}">Aa</span> ${ROLE_NAMES[a]} on ${ROLE_NAMES[b]?.toLowerCase()} · ${ratio.toFixed(1)}:1 <span class="muted">(needs ${min}:1)</span></li>`;
  }).join('');
  const steps = [
    ['Display', display, 'heading'],
    ['Heading 1', h2, 'heading'],
    ['Heading 2', h3, 'heading'],
    ['Body', body, 'body'],
    ['Small', small, 'body'],
  ] as const;
  const typeRows = steps
    .map(
      ([label, size, face]) =>
        `<li class="type-row"><span class="muted label">${label} · ${size}px</span><span class="${face === 'heading' ? 'h' : 'b'}" style="font-size:${size}px">${face === 'heading' ? heading : `${site}, the way it should feel.`}</span></li>`,
    )
    .join('');
  const icons = Object.entries(ICONS)
    .map(
      ([name, d]) => `<li class="icon">${icon(d, stroke)}<span class="muted">${name}</span></li>`,
    )
    .join('');
  const three = decors.some((d) => d.three);
  // A blob radius ("40% 60% …") suits a button or a card, not a box the size of a hero.
  const plain = (r: string | undefined) => (r && /^\d+(\.\d+)?(px|rem)?$/.test(r) ? r : '28px');
  const heroRadius = plain(shape?.radius.card);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(spec.name)} · ${site}</title>
<style>
${FONT_SLOT}
:root{${cssVariables(spec)}
--radius-control:${shape?.radius.control ?? '8px'};--radius-card:${shape?.radius.card ?? '12px'};
--line:${shape?.border ?? '1px solid var(--border)'};--shadow:${shape?.shadow ?? 'none'};
--fast:${fast}ms;--slow:${slow}ms;--ease:${easing};--gap:${gap}px;--section:${section}px}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font:${body}px/${type?.lineHeight.body ?? 1.5} var(--font-body)}
.h{font-family:var(--font-heading);line-height:${type?.lineHeight.heading ?? 1.1};letter-spacing:${type?.tracking ?? 0}em;text-transform:${headingCase};${type?.case === 'small-caps' ? 'font-variant:small-caps;' : ''}margin:0}
.b{font-family:var(--font-body)}
.muted{color:var(--muted)}
main{max-width:1080px;margin:0 auto;padding:var(--gap)}
section{margin:0 0 var(--section)}
section>h2{font:600 ${small}px/1.4 var(--font-body);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 var(--gap);border-bottom:var(--line);padding-bottom:8px}
ul{list-style:none;margin:0;padding:0}
.lede{max-width:60ch;color:var(--muted)}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.swatch{display:flex;gap:12px;align-items:center}
.chip{width:48px;height:48px;border-radius:var(--radius-control);border:var(--line);flex:none}
code{font:${small}px/1.4 ui-monospace,monospace;color:var(--muted)}
.pairs li{margin:6px 0}
.pair{display:inline-block;width:40px;text-align:center;border-radius:var(--radius-control);border:var(--line);font-weight:700}
.type-row{display:grid;grid-template-columns:140px 1fr;gap:16px;align-items:baseline;margin:0 0 12px}
.nav{display:flex;align-items:center;gap:var(--gap);padding:12px var(--gap);background:var(--surface);border:var(--line);border-radius:var(--radius-card);box-shadow:var(--shadow)}
.nav .brand{font-family:var(--font-heading);font-weight:700;margin-right:auto}
.nav a{color:var(--text);text-decoration:none}
.nav a[aria-current]{color:var(--accent);text-decoration:underline;text-underline-offset:6px}
.row{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.btn{font:600 ${body}px/1 var(--font-body);padding:12px 20px;border-radius:var(--radius-control);border:var(--line);background:var(--surface);color:var(--text);box-shadow:var(--shadow);transition:transform var(--fast) var(--ease),background var(--fast) var(--ease);cursor:pointer}
.btn:hover{transform:translateY(-1px)}
.btn.primary{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
.btn.quiet{background:transparent;border-color:transparent;box-shadow:none;color:var(--accent)}
.btn[disabled]{opacity:.45;cursor:not-allowed;transform:none}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:var(--gap)}
.card{background:var(--surface);border:var(--line);border-radius:var(--radius-card);box-shadow:var(--shadow);padding:var(--gap)}
label{display:block;font-weight:600;margin:0 0 6px}
.input{width:100%;font:inherit;padding:10px 12px;border:var(--line);border-radius:var(--radius-control);background:var(--bg);color:var(--text)}
.input.error{border:2px solid var(--text)}
.help{font-size:${small}px;color:var(--muted);margin:6px 0 0}
.err{font-size:${small}px;color:var(--text);margin:6px 0 0}
.err::before{content:"! ";color:var(--accent2);font-weight:700}
.check{display:flex;gap:8px;align-items:center;margin:8px 0}
.box{width:20px;height:20px;border:var(--line);border-radius:4px;background:var(--accent);display:inline-grid;place-items:center;color:var(--on-accent);font-size:13px}
.switch{width:40px;height:22px;border-radius:999px;background:var(--accent);position:relative;display:inline-block}
.switch::after{content:"";position:absolute;top:3px;left:21px;width:16px;height:16px;border-radius:50%;background:var(--on-accent)}
.tags{display:flex;gap:8px;flex-wrap:wrap}
.tag{font-size:${small}px;padding:4px 10px;border-radius:var(--radius-control);border:var(--line);background:var(--bg)}
.table{width:100%;border-collapse:collapse}
.table td,.table th{text-align:left;padding:10px 12px;border-bottom:var(--line)}
.table th{font-size:${small}px;color:var(--muted);font-weight:600}
.toast{align-self:start;display:flex;gap:12px;align-items:center;background:var(--text);color:var(--bg);padding:12px 16px;border-radius:${heroRadius};box-shadow:var(--shadow);max-width:420px}
.modal{max-width:460px}
.modal header{display:flex;justify-content:space-between;align-items:center;margin:0 0 12px}
.icons{display:flex;flex-wrap:wrap;gap:var(--gap)}
.icon{display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--accent);font-size:${small}px}
.hero{position:relative;overflow:hidden;background:var(--surface);border:var(--line);border-radius:${heroRadius};box-shadow:var(--shadow);padding:calc(var(--section) * .75) var(--gap);display:grid;grid-template-columns:1.2fr 1fr;gap:var(--gap);align-items:center;animation:page-in var(--slow) var(--ease) both}
.hero .h{font-size:${display}px}
.hero img{width:100%;border-radius:var(--radius-card)}
.hero .art{aspect-ratio:4/3;border-radius:var(--radius-card);background:linear-gradient(135deg,var(--accent),var(--accent2))}
.note{font-size:${small}px;color:var(--muted);margin-top:8px}
@keyframes page-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (max-width:720px){.hero{grid-template-columns:1fr}.type-row{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
${shape?.css ?? ''}
${decors.map((d) => d.css ?? '').join('\n')}
</style></head>
<body><main>
<section aria-labelledby="t-name">
  <h1 id="t-name" class="h" style="font-size:${h2}px">${esc(spec.name)}</h1>
  <p class="lede">${esc(words.line ?? spec.notes)}</p>
</section>
<section aria-labelledby="t-hero"><h2 id="t-hero">Hero</h2>
  <div class="hero">
    <div><p class="h">${heading}</p><p class="muted">${site}</p><div class="row"><button class="btn primary" type="button">${button}</button><button class="btn quiet" type="button">Learn more</button></div></div>
    ${art.hero ? `<img src="${art.hero}" alt="An illustration in this direction">` : '<div class="art" aria-hidden="true"></div>'}
  </div>
  ${three ? '<p class="note">On the real site this hero gets a small 3D scene; a board shows it still.</p>' : ''}
</section>
<section aria-labelledby="t-color"><h2 id="t-color">Colors</h2>
  <ul class="swatches">${swatches}</ul>
  <ul class="pairs" style="margin-top:16px">${pairs}</ul>
</section>
<section aria-labelledby="t-type"><h2 id="t-type">Type · ${esc(spec.type.heading.family)} and ${esc(spec.type.body.family)}</h2>
  <ul>${typeRows}</ul>
</section>
<section aria-labelledby="t-nav"><h2 id="t-nav">Navigation</h2>
  <nav class="nav" aria-label="Example navigation"><span class="brand">${site}</span>${nav.map((n, i) => `<a href="#t-nav"${i === 0 ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>
</section>
<section aria-labelledby="t-buttons"><h2 id="t-buttons">Buttons</h2>
  <div class="row"><button class="btn primary" type="button">${button}</button><button class="btn" type="button">Secondary</button><button class="btn quiet" type="button">Quiet</button><button class="btn primary" type="button" disabled>Disabled</button></div>
</section>
<section aria-labelledby="t-forms"><h2 id="t-forms">Forms</h2>
  <div class="grid">
    <div><label for="f1">${field}</label><input id="f1" class="input" placeholder="${field}"><p class="help">A line of help under the field.</p></div>
    <div><label for="f2">${field}</label><input id="f2" class="input error" value="Not quite right"><p class="err">Say what went wrong and how to fix it.</p></div>
    <div><label for="f3">Choose one</label><select id="f3" class="input"><option>${nav[1] ?? 'Option'}</option></select>
      <div class="check"><span class="box" aria-hidden="true">✓</span> Remember me</div>
      <div class="check"><span class="switch" aria-hidden="true"></span> Notifications on</div></div>
  </div>
</section>
<section aria-labelledby="t-cards"><h2 id="t-cards">Cards and tags</h2>
  <div class="grid">
    <article class="card"><p class="h" style="font-size:${h3}px">${heading}</p><p class="muted">A card the way ${site} would show one.</p><div class="tags"><span class="tag">${nav[1] ?? 'New'}</span><span class="tag">${nav[2] ?? 'Featured'}</span></div></article>
    <article class="card"><table class="table"><thead><tr><th>Name</th><th>Status</th></tr></thead><tbody><tr><td>${site}</td><td>Live</td></tr><tr><td>${nav[1] ?? 'Draft'}</td><td>Draft</td></tr></tbody></table></article>
  </div>
</section>
<section aria-labelledby="t-feedback"><h2 id="t-feedback">Feedback</h2>
  <div class="grid">
    <div class="toast" role="status"><span>Saved. ${button} worked.</span></div>
    <div class="card modal" role="dialog" aria-label="Example dialog"><header><span class="h" style="font-size:${h3}px">Are you sure?</span><span class="muted">Close</span></header><p class="muted">A dialog header and its actions.</p><div class="row"><button class="btn primary" type="button">${button}</button><button class="btn" type="button">Cancel</button></div></div>
  </div>
</section>
<section aria-labelledby="t-icons"><h2 id="t-icons">Icons</h2><ul class="icons">${icons}</ul></section>
</main></body></html>`;
}
