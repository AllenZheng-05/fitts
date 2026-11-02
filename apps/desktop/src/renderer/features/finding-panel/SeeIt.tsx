// "See it yourself" (SPEC-phase4 §5.4): the finding's repro: where to start, the numbered steps
// with each step's shot, expected vs actual, the environment, where in the code, the standards
// it's about, and the copyable steps and Playwright test.
import type { Finding, RunState } from '@fitts/schema';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { RichText } from '../../components/RichText';
import { copy } from '../../copy';
import { bridge } from '../../lib/bridge';
import { copyText } from '../../lib/clipboard';
import { format } from '../../lib/format';
import { useToasts } from '../../state/toasts';
import { getEngine } from '../../state/engine';
import { useUi } from '../../state/ui';

export function SeeIt({ run, finding }: { run: RunState; finding: Finding }) {
  const repro = finding.repro;
  const toast = useToasts((s) => s.show);
  const [chainOpen, setChainOpen] = useState(false);
  const s = copy.finding.seeIt;
  if (!repro) return <p className="text-[13px] text-muted">{s.none}</p>;
  const stepsText = [
    `${s.start}: ${repro.start.url} (${repro.start.device})`,
    ...repro.steps.map((st) => `${st.n}. ${st.text.replace(/\*\*/g, '')}`),
    `${s.expected}: ${repro.expected}`,
    `${s.actual}: ${repro.actual}`,
    `${s.environment}: ${repro.environment}`,
  ].join('\n');
  const chain = (finding.sourceChain ?? []).filter(
    (f) => f.kind !== 'host' && (f.component || f.src),
  );
  const copyOut = (text: string, done: string) =>
    void copyText(text).then((ok) => ok && toast(done));
  return (
    <div className="flex flex-col gap-2.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold">{s.start}:</span>
        <span className="font-mono text-[12px]">{repro.start.url}</span>
        <Chip className="px-2 py-0.5">{repro.start.device}</Chip>
        {repro.confirmed === 'replayed' && (
          <Chip tone="mint" className="px-2 py-0.5">
            {s.replayed}
          </Chip>
        )}
        {repro.confirmed === 'owner' && (
          <Chip tone="coral" className="px-2 py-0.5">
            {s.ownerSaw}
          </Chip>
        )}
      </div>
      {repro.steps.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {repro.steps.map((st) => (
            <li key={st.n} className="flex items-start gap-2">
              <span className="w-5 flex-none font-mono text-[12px] text-muted">{st.n}.</span>
              {st.shot !== undefined && (
                <img
                  src={`fitts-asset://${run.projectId}/${run.runId}/shots/${st.shot}.jpg`}
                  alt={format(s.shotAlt, { n: st.n })}
                  className="h-10 w-16 flex-none rounded-tag border border-ink object-cover object-top"
                />
              )}
              <span className="min-w-0 flex-1">
                <RichText text={st.text} />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted">{s.noSteps}</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-control bg-mint-tint p-2">
          <span className="block text-[12px] font-bold text-mint-ink">{s.expected}</span>
          {repro.expected || '—'}
        </div>
        <div className="rounded-control bg-coral-tint p-2">
          <span className="block text-[12px] font-bold text-coral-ink">{s.actual}</span>
          {repro.actual || '—'}
        </div>
      </div>
      <p className="text-muted">
        <span className="font-semibold text-ink-2">{s.environment}:</span> {repro.environment}
      </p>
      {finding.source && (
        <p className="font-mono text-[12px]">
          <span className="font-sans font-semibold">{copy.finding.sourceLabel}:</span>{' '}
          {finding.source.file}:{finding.source.line}
          <span className="text-muted">
            {' '}
            · {copy.finding.sourceConfidence[finding.source.confidence]}
          </span>
          {bridge().openInEditor && (
            <Button
              size="inline"
              className="ml-2"
              onClick={() =>
                bridge().openInEditor?.(
                  run.projectId,
                  finding.source?.file ?? '',
                  finding.source?.line ?? 1,
                )
              }
            >
              {s.openInEditor}
            </Button>
          )}
          {chain.length > 0 && (
            <button
              type="button"
              aria-expanded={chainOpen}
              onClick={() => setChainOpen((o) => !o)}
              className="ml-2 font-sans text-[12px] font-semibold text-cobalt-ink underline hover:text-cobalt-deep"
            >
              {chainOpen ? s.hideChain : format(s.showChain, { n: chain.length })}
            </button>
          )}
          {chainOpen && (
            <span className="block text-muted">
              {chain.map((f) => `${f.component ?? '?'}${f.src ? ` (${f.src})` : ''}`).join(' ‹ ')}
            </span>
          )}
        </p>
      )}
      {(repro.wcag?.length || repro.rule) && (
        <ul className="flex flex-wrap gap-1.5">
          {repro.wcag?.map((c) => (
            <li key={c.sc}>
              <button
                type="button"
                onClick={() => bridge().openLink?.(c.url)}
                className="rounded-tag border border-ink bg-card px-2 py-0.5 text-[12px] font-semibold hover:bg-paper"
              >
                WCAG {c.sc} {c.name}
              </button>
            </li>
          ))}
          {repro.rule && (
            <li>
              <button
                type="button"
                onClick={() => bridge().openLink?.(repro.rule?.url ?? '')}
                className="rounded-tag border border-ink bg-card px-2 py-0.5 text-[12px] font-semibold hover:bg-paper"
              >
                axe {repro.rule.id}
              </button>
            </li>
          )}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => copyOut(stepsText, s.stepsCopied)}>
          {s.copySteps}
        </Button>
        {repro.playwright && (
          <Button size="sm" onClick={() => copyOut(repro.playwright ?? '', s.testCopied)}>
            {s.copyTest}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => {
            getEngine().showFinding(run.projectId, finding.id);
            useUi.getState().set({ openFindingId: null });
          }}
        >
          {copy.finding.replay}
        </Button>
      </div>
    </div>
  );
}
