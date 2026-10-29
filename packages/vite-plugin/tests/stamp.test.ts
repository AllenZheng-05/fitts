import { describe, expect, it } from 'vitest';
import fittsSource, { ATTR, stampSource } from '../src/index';

const ROOT = '/repo';

describe('stampSource', () => {
  it('stamps host elements with path:line:col and leaves components alone', () => {
    const code = [
      'export function A() {',
      '  return (',
      '    <div className="a">',
      '      <Button label="x" />',
      '      <button type="button">Go</button>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    const out = stampSource(code, '/repo/src/A.tsx', ROOT);
    expect(out?.code).toContain(`<div ${ATTR}="src/A.tsx:3:5" className="a">`);
    expect(out?.code).toContain(`<button ${ATTR}="src/A.tsx:5:7" type="button">`);
    expect(out?.code).toContain('<Button label="x" />');
  });

  it('handles TypeScript syntax and self-closing tags', () => {
    const code = 'const f = (x: number): JSX.Element => <input value={x as number} />;';
    const out = stampSource(code, '/repo/src/f.tsx', ROOT);
    expect(out?.code).toContain(`<input ${ATTR}="src/f.tsx:1:39" value=`);
  });

  it('keeps an existing stamp, skips member tags and fragments', () => {
    const code = `const a = <><motion.div /><span ${ATTR}="keep" /></>;`;
    expect(stampSource(code, '/repo/a.jsx', ROOT)).toBeNull();
  });

  it('returns null for files with no JSX and for unparsable code', () => {
    expect(stampSource('export const x = 1;', '/repo/x.tsx', ROOT)).toBeNull();
    expect(stampSource('<<<', '/repo/x.tsx', ROOT)).toBeNull();
  });

  it('produces a source map', () => {
    const out = stampSource('const a = <p>hi</p>;', '/repo/a.jsx', ROOT);
    expect(out?.map.mappings.length).toBeGreaterThan(0);
  });
});

describe('fittsSource plugin', () => {
  it('only applies in dev (serve), runs before React, and skips node_modules', () => {
    const plugin = fittsSource();
    expect(plugin.apply).toBe('serve');
    expect(plugin.enforce).toBe('pre');
    const transform = plugin.transform as (code: string, id: string) => unknown;
    expect(transform('const a = <p />;', '/repo/node_modules/x/a.jsx')).toBeNull();
    expect(transform('const a = <p />;', '/repo/src/a.css')).toBeNull();
  });
});
