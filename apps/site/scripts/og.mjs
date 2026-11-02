// Renders public/og.png (1200×630): the Fitts mark and wordmark with the tagline, in the app's
// tokens and Bricolage Grotesque 800, on paper with the still field's shapes. Run `pnpm og` after
// changing the tagline. Uses the system Edge, so no browser download is needed.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const here = (p) => resolve(import.meta.dirname, '..', p);
const tokens = readFileSync(here('src/styles/tokens.css'), 'utf8');
const font = readFileSync(
  here(
    'node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2',
  ),
).toString('base64');
const brand = readFileSync(here('src/components/brand.tsx'), 'utf8');
const markSvg = brand.slice(brand.indexOf('<svg'), brand.indexOf('</svg>') + 6);
const { home } = await import('../src/content/home.ts');
const tagline = home.tagline;

// The mark's JSX → plain SVG: token classes become fills and strokes.
const mark = markSvg
  .replace(/\n\s*/g, ' ')
  .replace(/width=\{size\}/, 'width="200"')
  .replace(/height=\{size\}/, 'height="200"')
  .replace(/className=\{className\}|role=\{[^}]+\}|aria-label=\{title\}|aria-hidden=\{[^}]+\}/g, '')
  .replace(/strokeWidth/g, 'stroke-width')
  .replace(/strokeLinecap/g, 'stroke-linecap')
  .replace(/className="([^"]+)"/g, (_, cls) =>
    cls
      .split(' ')
      .map((c) => {
        const [, kind, token] = /^(fill|stroke)-(.+)$/.exec(c) ?? [];
        return kind ? `${kind}="var(--${token})"` : '';
      })
      .join(' '),
  );

const html = `<!doctype html><html><head><style>
${tokens}
@font-face { font-family: 'Bricolage Grotesque'; font-weight: 200 800; src: url(data:font/woff2;base64,${font}) format('woff2'); }
html, body { margin: 0; }
body { width: 1200px; height: 630px; background: var(--paper); font-family: var(--font-display); color: var(--ink);
  display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; overflow: hidden; }
.row { display: flex; align-items: center; gap: 28px; }
.word { font-size: 210px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; }
.tag { margin-top: 26px; font-size: 58px; font-weight: 700; letter-spacing: -0.01em; }
.dot { position: absolute; border-radius: 50%; }
.frame { position: absolute; inset: 18px; border: 2px solid var(--ink); border-radius: 22px; box-shadow: 4px 4px 0 var(--ink); }
</style></head><body>
<div class="frame"></div>
<div class="dot" style="width:120px;height:120px;left:70px;top:70px;background:radial-gradient(circle at 36% 30%, var(--card) -30%, var(--coral) 45%)"></div>
<div class="dot" style="width:70px;height:70px;right:110px;top:90px;background:radial-gradient(circle at 36% 30%, var(--card) -30%, var(--sun) 45%)"></div>
<div class="dot" style="width:90px;height:90px;right:80px;bottom:70px;background:radial-gradient(circle at 36% 30%, var(--card) -30%, var(--cobalt) 45%)"></div>
<div class="dot" style="width:46px;height:46px;left:130px;bottom:90px;background:radial-gradient(circle at 36% 30%, var(--card) -30%, var(--mint) 45%)"></div>
<div class="row">${mark}<span class="word">Fitts</span></div>
<div class="tag">${tagline}</div>
</body></html>`;

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => globalThis.document.fonts.ready);
await page.screenshot({ path: here('public/og.png') });
await browser.close();
console.log('public/og.png');
