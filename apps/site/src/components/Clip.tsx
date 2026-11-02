import { Clapperboard, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { media as words } from '../content/site';
import { HONESTY, type Honesty, type Media } from '../media';
import { chip, chipBase, cx } from './ui';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The honesty label on a clip: what kind of project it shows. */
export function HonestyLabel({ honesty }: { honesty: Honesty | undefined }) {
  if (!honesty) return null;
  const tone = honesty === 'merged' ? chip.mint : honesty === 'untouched' ? chip.cobalt : chip.sun;
  return <span className={cx(chipBase, tone)}>{HONESTY[honesty]}</span>;
}

/**
 * A clip or screenshot slot. Clips load only near the screen, play muted and looping (not with
 * reduced motion), and always have a visible pause/play button (WCAG 2.2.2). An empty slot is a
 * "Clip coming" card in the site's style.
 */
export function Clip({ m, className }: { m: Media; className?: string }) {
  const frame = cx(
    'relative overflow-hidden rounded-card border-[1.5px] border-ink bg-surface-2',
    className,
  );
  if (!m.src)
    return (
      <div
        className={cx(
          frame,
          'flex aspect-video flex-col items-center justify-center gap-2 p-4 text-center',
        )}
      >
        <Clapperboard size={26} aria-hidden="true" className="text-muted" />
        <p className="font-semibold">{words.clipComing}</p>
        <p className="max-w-xs text-[14px] text-ink-2">{words.clipComingBody}</p>
      </div>
    );
  if (m.kind === 'image')
    return (
      <div className={frame}>
        <img
          src={m.src}
          alt={m.alt}
          width={m.width}
          height={m.height}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full"
        />
      </div>
    );
  return <Video m={m} className={frame} />;
}

function Video({ m, className }: { m: Media; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [wanted, setWanted] = useState(() => !reducedMotion());

  // Load the file only when the clip comes near the screen; play only while it's on screen.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        if (e.isIntersecting) setNear(true);
        if (!e.isIntersecting) v.pause();
        else if (wanted) void v.play().catch(() => undefined);
      },
      { rootMargin: '200px' },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [wanted, near]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      setWanted(true);
      void v.play().catch(() => undefined);
    } else {
      setWanted(false);
      v.pause();
    }
  };

  return (
    <div className={className}>
      <video
        ref={ref}
        src={near ? m.src : undefined}
        poster={m.poster || undefined}
        muted
        loop
        playsInline
        preload="none"
        aria-label={m.alt}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="block aspect-video w-full object-cover"
      />
      <button
        type="button"
        onClick={toggle}
        className="absolute bottom-3 left-3 flex min-h-11 items-center gap-2 rounded-pill border-[1.5px] border-ink bg-card px-4 text-[14px] font-semibold shadow-button [text-shadow:none] hover:bg-paper"
      >
        {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        {playing ? words.pause : words.play}
        <span className="sr-only">: {m.title}</span>
      </button>
    </div>
  );
}
