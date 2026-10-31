import type { Finding, RunState } from '@fitts/schema';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { copy } from '../../copy';
import { format } from '../../lib/format';

/** How long each step shows while playing. */
const STEP_MS = 1100;

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * How Fitts found it (Allen's feedback, round 4): the run's saved shot of each step that led to
 * the finding, played in order with what Fitts did at each one. It plays once on its own
 * (not with reduced motion), and steps back and forth by hand.
 */
export function Replay({ run, finding }: { run: RunState; finding: Finding }) {
  const steps = finding.replay ?? [];
  const [at, setAt] = useState(() => (reducedMotion() ? steps.length - 1 : 0));
  const [play, setPlaying] = useState(() => !reducedMotion() && steps.length > 1);
  // It stops on its own at the last step.
  const playing = play && at < steps.length - 1;
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setAt((i) => i + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, at]);

  const step = steps[at];
  if (!step) return <p className="text-[13px] text-muted">{copy.finding.replayNone}</p>;
  const last = at === steps.length - 1;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-[260px] overflow-hidden rounded-control border border-ink bg-paper">
        <img
          src={`fitts-asset://${run.projectId}/${run.runId}/shots/${step.step}.jpg`}
          alt={format(copy.finding.replayShotAlt, { step: step.step })}
          className="absolute inset-0 size-full object-contain"
        />
      </div>
      <div className="flex items-center gap-2">
        <IconButton
          aria-label={copy.finding.replayPrev}
          disabled={at === 0}
          onClick={() => {
            setPlaying(false);
            setAt((i) => Math.max(0, i - 1));
          }}
          icon={<ChevronLeft size={15} strokeWidth={2.5} aria-hidden="true" />}
        />
        <IconButton
          aria-label={playing ? copy.finding.replayPause : copy.finding.replayPlay}
          onClick={() => {
            if (playing) return setPlaying(false);
            if (last) setAt(0);
            setPlaying(true);
          }}
          icon={
            playing ? (
              <Pause size={15} strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <Play size={15} strokeWidth={2.5} aria-hidden="true" />
            )
          }
        />
        <IconButton
          aria-label={copy.finding.replayNext}
          disabled={last}
          onClick={() => {
            setPlaying(false);
            setAt((i) => Math.min(steps.length - 1, i + 1));
          }}
          icon={<ChevronRight size={15} strokeWidth={2.5} aria-hidden="true" />}
        />
        <p aria-live="polite" className="min-w-0 flex-1 text-[13px]">
          <span className="font-mono text-[12px] text-muted">
            {format(copy.finding.replayPosition, { i: at + 1, n: steps.length })}
          </span>{' '}
          {step.label}
          {last && <strong className="text-coral-ink"> · {copy.finding.replayHere}</strong>}
        </p>
      </div>
    </div>
  );
}
