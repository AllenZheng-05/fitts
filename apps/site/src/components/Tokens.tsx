/** The placeholder values /checks quotes as examples: "(null)", "undefined", "{{name}}" and so on. */
const TOKEN = /(\((?:null|undefined)\)|\bundefined\b|\bNaN\b|\[object Object\]|\{\{[^}]*\}\})/;

/**
 * Text with each quoted placeholder value marked up as code: they are literal values, not words,
 * and Fitts's placeholder-leak probe rightly skips code when it looks for leaks.
 */
export function Tokens({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKEN).map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="font-mono text-[0.92em]">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}
