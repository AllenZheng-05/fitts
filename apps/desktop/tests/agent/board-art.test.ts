// @vitest-environment node
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { boardWords, solidPng } from '../../src/agent/orchestrator/board-art';

describe('board art (SPEC-phase3 §2.1, §2.2)', () => {
  it('a solid PNG is a real PNG of that size and color', () => {
    const png = Buffer.from(solidPng(4, 3, '#336699'), 'base64');
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(4);
    expect(png.readUInt32BE(20)).toBe(3);
    const idat = png.indexOf('IDAT');
    const len = png.readUInt32BE(idat - 4);
    const raw = inflateSync(png.subarray(idat + 4, idat + 4 + len));
    expect([...raw.subarray(1, 4)]).toEqual([0x33, 0x66, 0x99]);
  });

  it('takes the site’s own words: its name, h1, a button, a field and the nav', () => {
    const words = boardWords(
      [
        {
          url: 'https://openteamsheets.com/',
          path: '/',
          title: 'Open Team Sheets | VGC teams',
          headings: ['Find a team sheet'],
          hasPassword: false,
          nodes: [
            { ref: 'a', role: 'link', name: 'Tournaments', region: 'nav', href: '/tournament' },
            { ref: 'b', role: 'link', name: 'Builder', region: 'nav', href: '/builder' },
            { ref: 'c', role: 'button', name: 'Filters' },
            { ref: 'd', role: 'textbox', name: 'Search Pokémon', type: 'text' },
            { ref: 'e', role: 'textbox', name: 'Password', type: 'password' },
          ],
        },
      ],
      'openteamsheets.com',
    );
    expect(words).toEqual({
      site: 'Open Team Sheets',
      heading: 'Find a team sheet',
      button: 'Filters',
      field: 'Search Pokémon',
      nav: ['Tournaments', 'Builder'],
    });
  });

  it('falls back to the host when the page has no title', () => {
    expect(boardWords([], 'example.com')).toEqual({ site: 'example.com' });
  });
});
