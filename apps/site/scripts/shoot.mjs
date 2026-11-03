// Screenshots of the built site, for looking at it while building: `node scripts/shoot.mjs out/ /
// /download/` (run `pnpm build` first). Uses the system Edge, so no browser download is needed.
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const [outDir = 'shots', ...paths] = process.argv.slice(2);
const server = await preview({ preview: { port: 5302 }, logLevel: 'error' });
const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    for (const p of paths.length ? paths : ['/']) {
      await page.goto(`http://localhost:5302${p}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      const name = `${outDir}/${p.replace(/\//g, '_') || 'home'}-${w}.png`;
      await page.screenshot({ path: name, fullPage: true });
      console.log(name);
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
