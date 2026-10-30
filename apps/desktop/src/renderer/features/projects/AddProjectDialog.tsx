import { FolderOpen, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Checkbox, TextField } from '../../components/fields';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/overlay/Modal';
import { Tabs } from '../../components/Tabs';
import { copy } from '../../copy';
import { bridge } from '../../lib/bridge';
import { format } from '../../lib/format';
import { useDetection } from '../../lib/use-detection';
import { projectFromFolder, projectFromUrl, type Detection } from '../../mock/detect';
import { addAndOpenProject } from '../../state/actions';
import { useUi } from '../../state/ui';
import { LiveVerify } from './LiveVerify';

type Kind = 'code' | 'live';

/** Add a project: code on this computer or a live site (SPEC §6.11). */
export function AddProjectDialog() {
  const open = useUi((s) => s.addProjectOpen);
  const close = () => useUi.getState().set({ addProjectOpen: false });
  return open ? <AddProjectForm onClose={close} /> : null;
}

function AddProjectForm({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<Kind>(() => useUi.getState().addProjectKind);
  // However the dialog closes (Cancel, Esc, adding a project), it next opens on code.
  useEffect(() => () => useUi.getState().set({ addProjectKind: 'code' }), []);
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [plugin, setPlugin] = useState(true);
  const [devCommand, setDevCommand] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [verified, setVerified] = useState(false);

  const detection = useDetection(folder);
  const suggested =
    kind === 'code'
      ? (detection?.name ?? '')
      : url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const shownName = nameEdited ? name : suggested;

  const canSubmit =
    shownName.trim().length > 0 &&
    (kind === 'code' ? detection !== null : url.trim().length > 0 && verified);

  const submit = () => {
    if (!canSubmit) return;
    if (kind === 'code' && detection) {
      const project = projectFromFolder(folder.trim(), shownName, {
        ...detection,
        devCommand: devCommand ?? detection.devCommand,
      });
      addAndOpenProject(project);
    } else {
      addAndOpenProject(projectFromUrl(url.trim(), shownName));
    }
  };

  const nameField = (
    <TextField
      label={copy.addProject.name}
      value={shownName}
      onChange={(e) => {
        setNameEdited(true);
        setName(e.target.value);
      }}
    />
  );

  return (
    <Modal open onClose={onClose} labelledBy="add-project-title" width={640}>
      <div className="flex max-h-full flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-center gap-2.5">
          <h1
            id="add-project-title"
            className="mr-auto font-display text-[26px] font-extrabold tracking-[-0.02em]"
          >
            {copy.addProject.title}
          </h1>
          <IconButton
            aria-label={copy.overlay.close}
            onClick={onClose}
            icon={<X size={15} strokeWidth={2.5} aria-hidden="true" />}
          />
        </div>

        <Tabs
          label={copy.addProject.typeLabel}
          variant="segmented"
          selected={kind}
          onSelect={(id) => setKind(id as Kind)}
          panelClassName="flex flex-col gap-4"
          items={[
            {
              id: 'code',
              label: copy.addProject.codeTab,
              hint: copy.addProject.codeTabHint,
              content: (
                <>
                  <TextField
                    label={copy.welcome.folderLabel}
                    mono
                    value={folder}
                    placeholder="~/code/portfolio"
                    onChange={(e) => setFolder(e.target.value)}
                    trailing={
                      <Button
                        size="md"
                        className="min-h-[46px]"
                        icon={<FolderOpen size={16} aria-hidden="true" />}
                        onClick={() => {
                          void bridge()
                            .pickFolder()
                            .then((path) => path && setFolder(path));
                        }}
                      >
                        {copy.welcome.browse}
                      </Button>
                    }
                  />
                  {detection && (
                    <DetectionList
                      detection={detection}
                      devCommand={devCommand}
                      onDevCommand={setDevCommand}
                    />
                  )}
                  <Checkbox
                    label={copy.addProject.plugin}
                    checked={plugin}
                    onChange={(e) => setPlugin(e.target.checked)}
                    className="items-center"
                  />
                  {nameField}
                </>
              ),
            },
            {
              id: 'live',
              label: copy.addProject.liveTab,
              hint: copy.addProject.liveTabHint,
              content: (
                <>
                  <TextField
                    label={copy.addProject.url}
                    type="url"
                    mono
                    value={url}
                    placeholder={copy.addProject.urlPlaceholder}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <LiveVerify url={url} onUrl={setUrl} onVerifiedChange={setVerified} />
                  {nameField}
                </>
              ),
            },
          ]}
        />

        <div className="flex justify-end gap-2.5">
          <Button size="md" className="min-h-12" onClick={onClose}>
            {copy.overlay.cancel}
          </Button>
          <Button
            variant="primary"
            size="md"
            className="min-h-12 px-[22px]"
            disabled={!canSubmit}
            onClick={submit}
          >
            {copy.addProject.submit}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DetectionList({
  detection,
  devCommand,
  onDevCommand,
}: {
  detection: Detection;
  devCommand: string | null;
  onDevCommand: (cmd: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const command = devCommand ?? detection.devCommand;
  const ok = (
    <span className="font-extrabold text-mint-ink" aria-hidden="true">
      ✓
    </span>
  );
  const warn = (
    <span className="font-extrabold text-sun-ink" aria-hidden="true">
      !
    </span>
  );
  return (
    <ul className="flex flex-col gap-2 rounded-card border border-ink bg-surface-2 px-3.5 py-3 text-[14px]">
      <li className="flex gap-2.5">
        {ok}
        <span className="flex-1">
          {format(copy.detection.framework, { framework: detection.framework })}
        </span>
      </li>
      <li className="flex items-center gap-2.5">
        {ok}
        <span className="flex-1">
          {copy.detection.devServer}
          {editing ? (
            <input
              aria-label={copy.detection.devServer.trim()}
              className="ml-1 rounded-tag border border-ink bg-card px-1.5 font-mono text-[13px]"
              value={command}
              onChange={(e) => onDevCommand(e.target.value)}
              onBlur={() => setEditing(false)}
            />
          ) : (
            <span className="font-mono text-[13px]">{command}</span>
          )}{' '}
          → {detection.url}
        </span>
        {!editing && (
          <button
            type="button"
            className="text-[13px] text-cobalt-ink underline"
            onClick={() => setEditing(true)}
          >
            {copy.detection.change}
          </button>
        )}
      </li>
      <li className="flex gap-2.5">
        {detection.repo ? ok : warn}
        <span className="flex-1">
          {detection.repo ? (
            <>
              {copy.detection.repo}
              <span className="font-mono text-[13px]">{detection.repo}</span>
            </>
          ) : (
            copy.detection.noRepo
          )}
        </span>
      </li>
      {!detection.hasPlugin && (
        <li className="flex gap-2.5">
          {warn}
          <span className="flex-1">{copy.detection.pluginWarning}</span>
        </li>
      )}
    </ul>
  );
}
