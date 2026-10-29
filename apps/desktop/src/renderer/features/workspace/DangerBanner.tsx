import { copy } from '../../copy';
import { setDangerous } from '../../state/actions';
import { useSettings } from '../../state/settings';

/** Red banner above the workspace header while Dangerous mode is on (SPEC §6.13). */
export function DangerBanner() {
  const dangerous = useSettings((s) => s.dangerous);
  if (!dangerous) return null;
  return (
    <div
      role="status"
      className="flex flex-none items-center gap-3 border-b-[1.5px] border-ink bg-danger px-5 py-2 text-card"
    >
      <strong className="text-[12px] tracking-[0.04em]">{copy.workspace.dangerBanner}</strong>
      <span className="flex-1 text-[13px]">{copy.workspace.dangerBannerDetail}</span>
      <button
        type="button"
        onClick={() => setDangerous(false)}
        className="min-h-8 rounded-control border-[1.5px] border-ink bg-card px-3 text-[13px] font-bold text-danger-ink hover:bg-danger-tint"
      >
        {copy.workspace.dangerTurnOff}
      </button>
    </div>
  );
}
