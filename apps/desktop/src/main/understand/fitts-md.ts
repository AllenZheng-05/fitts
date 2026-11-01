// FITTS.md (SPEC-phase4 §3.2): the project summary main keeps under userData for Muse Code's
// prompt file. Pure: a model in, Markdown out. Never written into the user's repo.
import type { AppModel } from '@fitts/schema';

export function fittsMd(model: AppModel): string {
  const lines = [
    `# ${model.projectId}`,
    '',
    model.summary,
    '',
    `Stack: ${model.stack.framework} · router ${model.stack.router} · ${model.stack.styling.join(', ') || 'no styling found'} · ${model.stack.language}`,
    '',
    '## Pages',
    '',
    ...model.pages.map(
      (p) =>
        `- \`${p.route}\`${p.title ? ` · ${p.title}` : ''}${p.file ? ` · ${p.file}` : ''}${p.gate ? ` · needs ${p.gate}` : ''}${
          p.features.length
            ? `\n${p.features.map((f) => `  - ${f.name}: ${f.description}`).join('\n')}`
            : ''
        }`,
    ),
    '',
    '## Journeys',
    '',
    ...model.journeys.map((j) => `- ${j.name} (${j.start}, priority ${j.priority}): ${j.goal}`),
    '',
    ...(model.tokens.length
      ? [
          '## Design tokens',
          '',
          ...model.tokens.map((t) => `- ${t.file} (${t.kind}): ${t.names.slice(0, 20).join(', ')}`),
          '',
        ]
      : []),
    ...(model.notes.length ? ['## Notes', '', ...model.notes.map((n) => `- ${n}`), ''] : []),
  ];
  return lines.join('\n');
}
