import type { Change, ChatItem, RunState } from '@fitts/schema';
import { useState } from 'react';
import { BeforeAfterSlider } from '../../components/BeforeAfterSlider';
import { Select } from '../../components/fields';
import { copy } from '../../copy';
import { format } from '../../lib/format';

type Page = NonNullable<Change['pages']>[number];

/** The applied redesign (§8.3), when the real engine has checked it on every page. */
export function appliedRedesign(run: RunState): (Change & { pages: Page[] }) | undefined {
  const c = run.changes.find((x) => x.kind === 'redesign' && x.status === 'verified');
  return c?.pages?.length ? (c as Change & { pages: Page[] }) : undefined;
}

/** The picked direction (or the first one), with its mockup if it has one. */
function direction(run: RunState) {
  const item = [...run.chat]
    .reverse()
    .find((c): c is Extract<ChatItem, { type: 'directions' }> => c.type === 'directions');
  return item?.options.find((o) => o.id === item.selectedId) ?? item?.options[0];
}

function Shot({ src }: { src: string | undefined }) {
  // Before and after are the same size, top-aligned, so the wipe lines them up.
  return src ? <img src={src} alt="" className="block w-full max-w-none" /> : null;
}

/**
 * The real redesign's before and after (SPEC-phase2 §5.4: "after" is the verifier's shot of
 * the redesigned page). Before it's applied, the current step shot against the direction's
 * mockup, labeled as a mockup.
 */
export function RedesignShots({
  run,
  everyPage = false,
  fill = false,
}: {
  run: RunState;
  everyPage?: boolean;
  fill?: boolean;
}) {
  const applied = appliedRedesign(run);
  const [route, setRoute] = useState<string | undefined>();
  const name = direction(run)?.name ?? '';

  if (!applied) {
    const mockup = direction(run)?.mockup;
    if (!mockup) return null;
    return (
      <BeforeAfterSlider
        fill={fill}
        afterLabel={format(copy.redesign.mockupAfter, { name })}
        before={
          <Shot
            src={`fitts-asset://${run.projectId}/${run.runId}/shots/${Math.max(1, run.step)}.jpg`}
          />
        }
        after={<img src={mockup} alt="" className="block h-full w-full object-cover object-top" />}
      />
    );
  }

  const afterLabel = format(copy.redesign.afterLabel, { name: name.toUpperCase() });
  if (everyPage)
    return (
      <ul className="absolute inset-0 z-10 flex flex-col gap-3 overflow-y-auto bg-surface-2 p-3">
        {applied.pages.map((p) => (
          <li key={p.route} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[11px] font-bold">
              <span className="rounded-tag border border-ink bg-card px-[7px] py-0.5">
                {copy.slider.before}
              </span>
              <span className="flex-1 text-center font-mono text-[12px] font-normal text-muted">
                {p.route}
              </span>
              <span className="rounded-tag border border-ink bg-card px-[7px] py-0.5">
                {afterLabel}
              </span>
            </div>
            <BeforeAfterSlider
              className="h-[260px] bg-card"
              showTags={false}
              beforeLabel={copy.slider.before}
              afterLabel={afterLabel}
              before={<Shot src={p.before} />}
              after={<Shot src={p.after} />}
            />
          </li>
        ))}
      </ul>
    );

  const page = applied.pages.find((p) => p.route === route) ?? applied.pages[0];
  return (
    <div className={fill ? 'absolute inset-0 z-10 flex flex-col' : 'flex min-h-0 flex-1 flex-col'}>
      {applied.pages.length > 1 && (
        <div className="flex flex-none items-center gap-2 border-b border-ink bg-card px-3 py-1.5">
          <Select
            label={copy.redesign.page}
            value={page?.route ?? ''}
            onChange={(e) => setRoute(e.target.value)}
            options={applied.pages.map((p) => ({ value: p.route, label: p.route }))}
          />
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <BeforeAfterSlider
          fill
          afterLabel={afterLabel}
          before={<Shot src={page?.before} />}
          after={<Shot src={page?.after} />}
        />
      </div>
    </div>
  );
}
