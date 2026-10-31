// What a style board needs from the run (SPEC-phase3 §2.1, §2.2): the owner's words from the
// crawl, and a blank canvas in the direction's background for the image model to paint on (it
// only edits images).
import { crc32, deflateSync } from 'node:zlib';
import type { BoardWords } from '@fitts/styles';
import type { AxSnapshot } from '../protocol';

const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};

/** A solid-color PNG, as base64. */
export function solidPng(width: number, height: number, hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  const [r, g, b] = m ? [1, 2, 3].map((i) => parseInt(m[i] ?? '0', 16)) : [255, 255, 255];
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r ?? 255, g ?? 255, b ?? 255], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

const short = (s: string | undefined, n: number) => {
  const t = (s ?? '').trim().replace(/\s+/g, ' ');
  return t && t.length <= n ? t : undefined;
};

/**
 * The site's own words for the board, from the first pages crawled: its name (the title, up to
 * a separator), its h1, a real button, a real field, and the nav's labels.
 */
export function boardWords(snaps: AxSnapshot[], fallbackName: string): BoardWords {
  const first = snaps[0];
  const title = first?.title.split(/\s+[|·–—-]\s+/)[0];
  const nodes = snaps.flatMap((s) => s.nodes);
  const button = nodes.find((n) => n.role === 'button' && short(n.name, 28));
  const field = nodes.find(
    (n) => n.role === 'textbox' && n.type !== 'password' && short(n.name, 32),
  );
  const nav = [
    ...new Set(
      nodes
        .filter((n) => n.region === 'nav' && n.role === 'link')
        .flatMap((n) => short(n.name, 18) ?? []),
    ),
  ].slice(0, 4);
  const heading = snaps.flatMap((s) => s.headings).find((h) => short(h, 70));
  return {
    site: short(title, 40) ?? fallbackName,
    ...(heading ? { heading: short(heading, 70) ?? heading } : {}),
    ...(button ? { button: short(button.name, 28) ?? button.name } : {}),
    ...(field ? { field: short(field.name, 32) ?? field.name } : {}),
    ...(nav.length > 0 ? { nav } : {}),
  };
}
