import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { pages, SITE_URL, type PageId } from './src/content/site';

const root = import.meta.dirname;

/** Each page's HTML file (a Vite multi-page build: no router, static on Cloudflare Pages). */
const HTML: Record<PageId, string> = {
  home: 'index.html',
  how: 'how-it-works/index.html',
  checks: 'checks/index.html',
  showcase: 'showcase/index.html',
  download: 'download/index.html',
  notfound: '404.html',
};

const pageFor = (path: string): PageId | undefined =>
  (Object.keys(HTML) as PageId[]).find((id) => `/${HTML[id]}` === path);

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Writes each page's <title>, description, canonical link and Open Graph tags from
 * src/content/site.ts (so the words live in one place), and emits sitemap.xml.
 */
function pageMeta(): Plugin {
  return {
    name: 'fitts-page-meta',
    transformIndexHtml(html, ctx) {
      const id = pageFor(ctx.path);
      if (!id) return html;
      const p = pages[id];
      const url = `${SITE_URL}${p.path}`;
      const tags = [
        `<title>${esc(p.title)}</title>`,
        `<meta name="description" content="${esc(p.description)}" />`,
        id === 'notfound'
          ? '<meta name="robots" content="noindex" />'
          : `<link rel="canonical" href="${url}" />`,
        '<meta property="og:type" content="website" />',
        '<meta property="og:site_name" content="Fitts" />',
        `<meta property="og:url" content="${url}" />`,
        `<meta property="og:title" content="${esc(p.title)}" />`,
        `<meta property="og:description" content="${esc(p.description)}" />`,
        `<meta property="og:image" content="${SITE_URL}/og.png" />`,
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        '<meta property="og:image:alt" content="The Fitts mark and wordmark, with the tagline Making sure your design fits." />',
        '<meta name="twitter:card" content="summary_large_image" />',
      ];
      return html.replace('<!-- page-meta -->', tags.join('\n    '));
    },
    generateBundle() {
      const urls = (Object.keys(HTML) as PageId[])
        .filter((id) => id !== 'notfound' && existsSync(resolve(root, HTML[id])))
        .map((id) => `  <url><loc>${SITE_URL}${pages[id].path}</loc></url>`);
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
      });
    },
  };
}

// A static site (Cloudflare Pages): `pnpm --filter @fitts/site build` writes dist/.
export default defineConfig({
  plugins: [react(), tailwindcss(), pageMeta()],
  resolve: {
    // geist's package exports hide its font files, so point at them directly (as the app does).
    alias: { '@geist-fonts': resolve(root, 'node_modules/geist/dist/fonts') },
  },
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        (Object.keys(HTML) as PageId[])
          .filter((id) => existsSync(resolve(root, HTML[id])))
          .map((id) => [id, resolve(root, HTML[id])]),
      ),
    },
  },
  server: { port: 5300 },
  preview: { port: 5301 },
});
