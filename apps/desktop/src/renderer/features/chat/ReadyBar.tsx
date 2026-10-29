import type { RunState } from '@fitts/schema';
import { Button } from '../../components/Button';
import { copy } from '../../copy';
import { requestStartAudit } from '../../state/actions';
import { isBriefReady } from '../../state/script';

/**
 * Pinned above the message box during the interview (SPEC §6.3). Once For and Who are
 * known it offers to start; before that it offers to skip.
 */
export function ReadyBar({ run }: { run: RunState }) {
  const ready = isBriefReady(run.brief);
  const start = () => requestStartAudit(run.projectId);
  return (
    <div className="flex items-center gap-2 rounded-control border border-ink bg-sun-tint px-2.5 py-2">
      <span className="min-w-0 flex-1 text-[13px] font-semibold text-sun-ink">
        {ready ? copy.fitts.readyBar : copy.ready.notYet}
      </span>
      {ready ? (
        // One way to start: answering more questions is just carrying on the chat.
        <Button variant="primary" size="sm" className="px-3.5 text-[14px]" onClick={start}>
          {copy.ready.start}
        </Button>
      ) : (
        <Button size="sm" onClick={start}>
          {copy.ready.skipLook}
        </Button>
      )}
    </div>
  );
}
