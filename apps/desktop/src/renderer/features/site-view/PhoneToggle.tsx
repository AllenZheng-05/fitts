import { SegmentedControl } from '../../components/SegmentedControl';
import { copy } from '../../copy';
import { format } from '../../lib/format';
import { useLiveSites } from '../../state/live-site';
import type { AfterState } from '../../state/site-versions';

/**
 * An Android app's "Live app / Fixed version" switch (Allen, Nov 2): it moves the emulator itself,
 * and says in words what the phone shows. The fixed version's own label ("Fixed version ·
 * <branch>") is on the site view.
 */
export function PhoneToggle({
  projectId,
  showAfter,
  state,
  onChoose,
}: {
  projectId: string;
  showAfter: boolean;
  state: AfterState;
  onChoose: (choice: 'live' | 'fixed') => void;
}) {
  const why = useLiveSites((s) => s.sites[projectId]?.phoneFallback);
  const words =
    state === 'live'
      ? copy.site.phoneState.live
      : state === 'switching'
        ? copy.site.phoneState.switching
        : state === 'imitation'
          ? why
            ? format(copy.site.phoneState.imitation, { why: copy.site.imitationWhy[why] })
            : copy.site.phoneState.webOnly
          : undefined;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        label={copy.site.phoneToggle}
        selected={showAfter ? 'fixed' : 'live'}
        onSelect={(id) => onChoose(id === 'fixed' ? 'fixed' : 'live')}
        segments={[
          { id: 'live', label: copy.site.liveApp },
          { id: 'fixed', label: copy.site.fixedVersion },
        ]}
      />
      <span role="status" className="text-[12px] text-muted">
        {words}
      </span>
    </div>
  );
}
