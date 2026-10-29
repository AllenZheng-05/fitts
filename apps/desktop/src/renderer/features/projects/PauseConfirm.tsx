import { useRef } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/overlay/Modal';
import { copy } from '../../copy';
import { format } from '../../lib/format';
import { confirmPauseAndStart } from '../../state/actions';
import { useProjects } from '../../state/projects';
import { useUi } from '../../state/ui';

/** "Pause hartwell-site's run to start this one?" (SPEC §6.9). */
export function PauseConfirm() {
  const confirm = useUi((s) => s.pauseConfirm);
  const running = useProjects((s) => s.projects.find((p) => p.id === confirm?.runningProjectId));
  const cancelRef = useRef<HTMLButtonElement>(null);
  const close = () => useUi.getState().set({ pauseConfirm: null });
  if (!confirm) return null;
  const name = running?.name ?? confirm.runningProjectId;
  return (
    <Modal
      open
      onClose={close}
      labelledBy="pause-confirm-title"
      describedBy="pause-confirm-body"
      width={480}
      initialFocusRef={cancelRef}
    >
      <div className="flex flex-col gap-3 p-6">
        <h2 id="pause-confirm-title" className="font-display text-[22px] font-bold">
          {format(copy.projects.pauseOtherTitle, { name })}
        </h2>
        <p id="pause-confirm-body" className="text-[14px] leading-normal text-ink-2">
          {copy.projects.pauseOtherBody}
        </p>
        <div className="mt-1 flex justify-end gap-2">
          <Button ref={cancelRef} size="md" onClick={close}>
            {copy.overlay.cancel}
          </Button>
          <Button variant="primary" size="md" onClick={confirmPauseAndStart}>
            {copy.projects.pauseOtherConfirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
