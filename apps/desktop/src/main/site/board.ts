// Style boards (SPEC-phase3 §2): the agent builds a board's HTML; main embeds its fonts as data
// URIs (downloaded once through main/fonts, from the cache after that) and saves it as a run
// asset, so the board itself never touches the network.
import { readFileSync } from 'node:fs';
import { FONT_SLOT } from '@fitts/styles';
import type { SiteOp } from '../../agent/protocol';
import type { FontStore } from '../fonts/fonts';
import type { SiteManager } from './manager';

type BoardOp = Extract<SiteOp, { op: 'board' }>;

/** @font-face rules with each file inline; a font that can't be had falls back to its stack. */
export async function boardFontCss(fonts: FontStore, asks: BoardOp['fonts']): Promise<string> {
  const rules: string[] = [];
  for (const ask of asks.slice(0, 3)) {
    const files = await fonts.files(ask).catch(() => null);
    for (const file of files?.files ?? []) {
      let data: string;
      try {
        data = readFileSync(file.path).toString('base64');
      } catch {
        continue;
      }
      rules.push(
        `@font-face{font-family:"${ask.family}";src:url(data:font/woff2;base64,${data}) format("woff2");font-weight:${file.weight};font-style:normal;font-display:swap}`,
      );
    }
  }
  return rules.join('\n');
}

export async function saveBoard(
  sites: SiteManager,
  fonts: FontStore,
  projectId: string,
  op: BoardOp,
): Promise<string> {
  const css = process.env['FITTS_OFFLINE'] === '1' ? '' : await boardFontCss(fonts, op.fonts);
  const html = op.html.replace(FONT_SLOT, css);
  return sites.saveAsset(projectId, op.runId, op.name, Buffer.from(html).toString('base64'));
}
