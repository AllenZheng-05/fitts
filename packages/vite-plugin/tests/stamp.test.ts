import { describe, expect, it } from 'vitest';
import fittsSource, { ATTR, HTML_TAGS, stampSource, SVG_TAGS } from '../src/index';

const ROOT = '/repo';

describe('stampSource', () => {
  it('stamps host elements with path:line:col and components with their call site', () => {
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
    // SPEC-phase4 §2.2: the call site, so the fixer can find where <Button> was used.
    expect(out?.code).toContain(`<Button ${ATTR}="src/A.tsx:4:7" label="x" />`);
  });

  it('handles TypeScript syntax and self-closing tags', () => {
    const code = 'const f = (x: number): JSX.Element => <input value={x as number} />;';
    const out = stampSource(code, '/repo/src/f.tsx', ROOT);
    expect(out?.code).toContain(`<input ${ATTR}="src/f.tsx:1:39" value=`);
  });

  it('stamps member-expression components like <motion.div>, and keeps an existing stamp', () => {
    const code = `const a = <><motion.div /><span ${ATTR}="keep" /></>;`;
    const out = stampSource(code, '/repo/a.jsx', ROOT);
    expect(out?.code).toContain(`<motion.div ${ATTR}="a.jsx:1:13" />`);
    expect(out?.code).toContain(`<span ${ATTR}="keep" />`);
  });

  it('leaves lowercase tags it doesn’t know alone (react-three-fiber’s <mesh>)', () => {
    const code = 'const a = <mesh><boxGeometry args={[1, 1, 1]} /></mesh>;';
    expect(stampSource(code, '/repo/a.jsx', ROOT)).toBeNull();
    expect(HTML_TAGS.has('mesh')).toBe(false);
    expect(SVG_TAGS.has('path')).toBe(true);
  });

  it('skips everything under a <Canvas> from @react-three/fiber, however it’s imported', () => {
    const code = [
      "import { Canvas as Scene } from '@react-three/fiber';",
      'export function Hero() {',
      '  return (',
      '    <section>',
      '      <Scene>',
      '        <ambientLight />',
      '        <Foo />',
      '        <mesh><boxGeometry /></mesh>',
      '      </Scene>',
      '      <p>Hello</p>',
      '    </section>',
      '  );',
      '}',
    ].join('\n');
    const out = stampSource(code, '/repo/src/Hero.tsx', ROOT);
    expect(out?.code).toContain(`<section ${ATTR}="src/Hero.tsx:4:5">`);
    expect(out?.code).toContain(`<p ${ATTR}="src/Hero.tsx:10:7">`);
    expect(out?.code).toContain('<Scene>');
    expect(out?.code).toContain('<Foo />');
    expect(out?.code).toContain('<ambientLight />');
    expect(out?.code).not.toContain(`<Foo ${ATTR}`);
  });

  it('a <Canvas> that isn’t from @react-three/fiber is an ordinary component', () => {
    const code = "import { Canvas } from './Canvas';\nconst a = <Canvas><p>x</p></Canvas>;";
    const out = stampSource(code, '/repo/a.jsx', ROOT);
    expect(out?.code).toContain(`<Canvas ${ATTR}="a.jsx:2:11">`);
    expect(out?.code).toContain(`<p ${ATTR}="a.jsx:2:19">`);
  });

  it('leaves a file with `fitts-ignore-file` untouched', () => {
    const code = '// fitts-ignore-file\nconst a = <div><Button /></div>;';
    expect(stampSource(code, '/repo/a.jsx', ROOT)).toBeNull();
    expect(stampSource('/* fitts-ignore-file */ const a = <p />;', '/repo/b.jsx', ROOT)).toBeNull();
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
