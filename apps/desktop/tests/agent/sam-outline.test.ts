// @vitest-environment node
// SAM outlines in page coordinates (Nov 2): the mask's raster covers only the element's box, so
// its path is moved and scaled onto that box before it's saved.
import { describe, expect, it } from 'vitest';
import { outlineSvg, placeOutline } from '../../src/agent/llm/media';

describe('placeOutline', () => {
  it('moves a box-relative outline onto the element’s box on the page', () => {
    // The Send button at 600,420, 120×40 on a 1280×800 shot; the raster is the box's own size.
    const bounds = { left: 600, top: 420, right: 720, bottom: 460 };
    const path = 'M0 0L120 0L120 40L0 40Z';
    expect(placeOutline(path, bounds, { width: 120, height: 40 })).toBe(
      'M600 420L720 420L720 460L600 460Z',
    );
  });

  it('scales a raster at another resolution to the box', () => {
    const bounds = { left: 100, top: 200, right: 140, bottom: 220 };
    expect(placeOutline('M0 0L20 0L20 10Z', bounds, { width: 20, height: 10 })).toBe(
      'M100 200L140 200L140 220Z',
    );
  });

  it('draws over the whole shot: the SVG is the shot’s size, the path where the element is', () => {
    const svg = outlineSvg('M600 420L720 420Z', 1280, 800);
    expect(svg).toContain('viewBox="0 0 1280 800"');
    expect(svg).toContain('d="M600 420L720 420Z"');
  });
});
