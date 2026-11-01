// @vitest-environment node
// The Fitts plugin, added to Vite dev servers from outside the project: it stamps host JSX elements with their
// source line, and leaves everything that only looks like JSX alone.
import { describe, expect, it } from 'vitest';
import { wrapper } from '../../src/main/projects/fitts-config';
// @ts-expect-error: a plain .mjs file shipped as a resource, without types.
import { stamp } from '../../resources/plugin/fitts.vite.mjs';

const run = (code: string) => (stamp as (c: string, f: string) => string | null)(code, 'src/A.tsx');

describe('the Fitts plugin', () => {
  it('stamps host elements with their file, line and column, and only those', () => {
    const out = run(
      [
        'export function A() {',
        '  return (',
        '    <main className="a">',
        '      <Button label="x" />',
        "      <p>Don't panic, it's fine</p>",
        '      {items.map((i) => <li key={i}>{i}</li>)}',
        '    </main>',
        '  );',
        '}',
      ].join('\n'),
    );
    expect(out).toContain('<main data-fitts-src="src/A.tsx:3:4" className="a">');
    expect(out).toContain('<p data-fitts-src="src/A.tsx:5:6">');
    expect(out).toContain('<li data-fitts-src="src/A.tsx:6:24" key={i}>');
    // v2 (SPEC-phase4 §2.2): components get their call site too.
    expect(out).toContain('<Button data-fitts-src="src/A.tsx:4:6" label="x" />');
  });

  it('stamps <motion.div> and leaves lowercase tags it doesn’t know alone', () => {
    expect(run('const a = <motion.div><mesh /></motion.div>;')).toBe(
      'const a = <motion.div data-fitts-src="src/A.tsx:1:10"><mesh /></motion.div>;',
    );
    expect(run('const a = <mesh><boxGeometry /></mesh>;')).toBeNull();
  });

  it('skips a <Canvas> subtree from @react-three/fiber, and a file that opts out', () => {
    const out = run(
      [
        "import { Canvas as Scene } from '@react-three/fiber';",
        'const a = <div><Scene><Foo /><mesh /></Scene><p>x</p></div>;',
      ].join('\n'),
    );
    expect(out).toContain('<div data-fitts-src="src/A.tsx:2:10">');
    expect(out).toContain('<Scene><Foo /><mesh /></Scene>');
    expect(out).toContain('<p data-fitts-src="src/A.tsx:2:45">');
    expect(run('// fitts-ignore-file\nconst a = <div />;')).toBeNull();
  });

  it('leaves generics, comparisons, strings, comments and templates alone', () => {
    const code = [
      'const [v, set] = useState<string>("");',
      'const big = a < b && c > d;',
      'const html = "<div>not jsx</div>";',
      '// <span> in a comment',
      'const t = `<em>${x}</em>`;',
      'function f<T>(x: T) { return x; }',
    ].join('\n');
    expect(run(code)).toBeNull();
  });

  it('doesn’t stamp twice', () => {
    expect(run('const a = <div data-fitts-src="x:1:1" />;')).toBeNull();
  });

  it('finds tags inside expressions inside tags', () => {
    const out = run('const a = <section>{ok ? <b>yes</b> : <i>no</i>}</section>;');
    expect(out?.match(/data-fitts-src/g)).toHaveLength(3);
  });

  it('wraps the project’s own config from node_modules/.fitts, plugin first, any config shape', () => {
    const w = wrapper('vite.config.ts');
    expect(w).toContain("import fitts from './fitts.vite.mjs';");
    expect(w).toContain("import project from '../../vite.config.ts';");
    expect(w).toContain("typeof project === 'function' ? project(env) : project");
    expect(w).toContain('plugins: [fitts({ vite }), ...(base.plugins ?? [])]');
    // No config of its own: Vite's defaults, with the plugin.
    expect(wrapper(undefined)).toContain('const project = {};');
  });
});
