// An Android repro as a Maestro flow (SPEC-phase4 §9.3): the steps as taps and typing on the
// app, then what should be seen (the actual, commented with the expected). Pure.
import type { Finding, Repro } from '@fitts/schema';

const yamlString = (s: string) => JSON.stringify(s);

/** The flow for one repro on the app `appId` ("com.basilandember.order"). */
export function maestroFlow(finding: Finding, repro: Repro, appId: string): string {
  const steps = repro.steps
    .filter((s) => !/^Open /.test(s.text.replace(/\*\*/g, '')))
    .map((s) => {
      const text = s.text.replace(/\*\*/g, '');
      const typed = /^Type “(.*)” in /.exec(text) ?? /^Type "(.*)" in /.exec(text);
      if (typed?.[1] !== undefined) return `- inputText: ${yamlString(typed[1])}`;
      if (/^(Go back|Press Back)/i.test(text)) return '- back';
      const t = s.target;
      if (t?.testId) return `- tapOn: { id: ${yamlString(t.testId)} }`;
      if (t?.name) return `- tapOn: ${yamlString(t.name)}`;
      return `# ${text}`;
    });
  const seen = /"([^"]{2,60})"/.exec(repro.actual)?.[1];
  return [
    `# ${finding.title}`,
    `# Fitts repro · ${repro.environment}`,
    `appId: ${appId}`,
    '---',
    '- launchApp',
    ...steps,
    ...(seen
      ? [
          `- assertVisible: ${yamlString(seen)}   # actual; expected: ${repro.expected || finding.fix}`,
        ]
      : [
          `# Expected: ${repro.expected || finding.fix}`,
          `# Actual: ${repro.actual || finding.finding}`,
        ]),
    '',
  ].join('\n');
}
