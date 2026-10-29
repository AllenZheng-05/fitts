import { Check, FolderOpen } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { Select, TextField } from '../../components/fields';
import { FittsEmblem } from '../../components/brand/FittsEmblem';
import { copy } from '../../copy';
import { bridge } from '../../lib/bridge';
import { format } from '../../lib/format';
import { detectFolder, isKeyValid, KEY_CHECK_MS, projectFromFolder } from '../../mock/detect';
import { LAST_RUN_CAPTIONS, MOCK_USER } from '../../mock/fixtures/projects';
import { addAndOpenProject } from '../../state/actions';
import { useProjects } from '../../state/projects';
import { useRunStore } from '../../state/run-store';
import { useSettings, type UserMode } from '../../state/settings';
import { useUi } from '../../state/ui';

const MODES: UserMode[] = ['plan', 'ask-every', 'ask-unsure', 'autonomous'];

/** First launch (setup card) or, with projects, "Welcome back" (SPEC §6.1, §7.7). */
export function Welcome() {
  const hasProjects = useProjects((s) => s.projects.length > 0);
  return (
    <main
      data-backdrop
      className="relative mx-auto flex h-full max-w-[1360px] items-center gap-14 px-16 py-10"
    >
      <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-[18px]">
        <FittsEmblem animate />
        <h1 className="font-display text-[68px] leading-[0.98] font-extrabold tracking-[-0.035em]">
          {copy.welcome.title}
        </h1>
        <p className="max-w-[500px] text-[20px] leading-[1.45] text-ink-2">{copy.welcome.lead}</p>
        <p className="max-w-[500px] text-[14px] leading-normal text-muted">{copy.welcome.small}</p>
      </div>
      {hasProjects ? <WelcomeBack /> : <SetupCard />}
    </main>
  );
}

function SetupCard() {
  const settings = useSettings();
  const openSettings = useUi((s) => s.openSettings);
  const [key, setKey] = useState('');
  const [keyWorks, setKeyWorks] = useState(settings.keys.meta);
  const [folder, setFolder] = useState('');
  const [mode, setMode] = useState<UserMode>(settings.defaultMode);
  const headingId = useId();
  const hintId = useId();
  const liveHintId = useId();

  // Mock validation: 600ms after typing stops, "Works" if the key is 8+ characters (§6.1).
  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => setKeyWorks(isKeyValid(key)), KEY_CHECK_MS);
    return () => clearTimeout(timer);
  }, [key]);

  const detection = detectFolder(folder);
  const ready = keyWorks && detection !== null;

  const open = () => {
    if (!detection) return;
    settings.setKey('meta', true);
    settings.set({ defaultMode: mode });
    addAndOpenProject(projectFromFolder(folder.trim(), detection.name, detection));
  };

  // A live site is audit-only: the same Add a project dialog, opened on its Live tab.
  const openLive = () => {
    settings.setKey('meta', true);
    settings.set({ defaultMode: mode });
    useUi.getState().set({ addProjectOpen: true, addProjectKind: 'live' });
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex max-w-[540px] min-w-0 flex-[1_1_460px] flex-col gap-4 rounded-hero border-[1.5px] border-ink bg-card p-6 shadow-hero"
    >
      <h2 id={headingId} className="font-display text-[22px] font-bold">
        {copy.welcome.setupTitle}
      </h2>

      <div className="flex flex-col gap-1.5">
        <TextField
          label={copy.welcome.keyLabel}
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setKeyWorks(false);
          }}
          trailing={
            keyWorks ? (
              <Chip tone="mint" className="self-center px-2.5 py-1.5" role="status">
                {copy.welcome.keyWorks}
              </Chip>
            ) : null
          }
        />
        <button
          type="button"
          onClick={() => openSettings('keys')}
          className="self-start text-[13px] text-cobalt-ink underline hover:text-cobalt-deep"
        >
          {copy.welcome.moreKeys}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold">{copy.welcome.computer}</span>
        <ul className="flex flex-wrap items-center gap-1.5">
          {copy.welcome.computerChips.map((chip) => (
            <li key={chip}>
              <Chip tone="mint" size="md">
                {format(chip, { github: MOCK_USER.github })}
              </Chip>
            </li>
          ))}
          <li>
            <PermissionChip
              allowed={settings.micAllowed}
              allowLabel={copy.welcome.allowMic}
              allowedLabel={copy.welcome.micAllowed}
              onAllow={() => settings.set({ micAllowed: true })}
            />
          </li>
          <li>
            <PermissionChip
              allowed={settings.notificationsAllowed}
              allowLabel={copy.welcome.allowNotifications}
              allowedLabel={copy.welcome.notificationsAllowed}
              onAllow={() => settings.set({ notificationsAllowed: true })}
            />
          </li>
        </ul>
      </div>

      <TextField
        label={copy.welcome.folderLabel}
        mono
        value={folder}
        placeholder={copy.welcome.folderPlaceholder}
        onChange={(e) => setFolder(e.target.value)}
        hint={
          detection
            ? format(copy.detection.found, { framework: detection.framework, url: detection.url })
            : undefined
        }
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

      <Select
        label={copy.welcome.modeLabel}
        size="lg"
        value={mode}
        onChange={(e) => setMode(e.target.value as UserMode)}
        options={MODES.map((m) => ({ value: m, label: copy.welcome.modeOptions[m] }))}
      />

      <Button
        variant="primary"
        size="lg"
        disabled={!ready}
        aria-describedby={ready ? undefined : hintId}
        onClick={open}
      >
        {copy.welcome.open}
      </Button>
      {!ready && (
        <span id={hintId} className="-mt-2 text-[13px] text-muted">
          {copy.welcome.openHint}
        </span>
      )}

      <p className="border-t border-ink-faint pt-3 text-[13px] text-ink-2">
        {copy.welcome.liveLead}{' '}
        <button
          type="button"
          disabled={!keyWorks}
          aria-describedby={keyWorks ? undefined : liveHintId}
          onClick={openLive}
          className="font-semibold text-cobalt-ink underline hover:text-cobalt-deep disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
        >
          {copy.welcome.liveLink}
        </button>
        {!keyWorks && (
          <span id={liveHintId} className="text-muted">
            {' '}
            {copy.welcome.liveNeedsKey}
          </span>
        )}
      </p>
    </section>
  );
}

function PermissionChip({
  allowed,
  allowLabel,
  allowedLabel,
  onAllow,
}: {
  allowed: boolean;
  allowLabel: string;
  allowedLabel: string;
  onAllow: () => void;
}) {
  if (allowed) {
    return (
      <Chip tone="mint" size="md" icon={<Check size={14} strokeWidth={2.5} aria-hidden="true" />}>
        {allowedLabel}
      </Chip>
    );
  }
  return (
    <button
      type="button"
      onClick={onAllow}
      className="min-h-[34px] rounded-pill border border-ink bg-sun-tint px-3 text-[13px] font-bold text-sun-ink hover:bg-sun"
    >
      {allowLabel}
    </button>
  );
}

function WelcomeBack() {
  const projects = useProjects((s) => s.projects);
  const runs = useRunStore((s) => s.runs);
  const openProject = useUi((s) => s.openProject);
  const openAddProject = () => useUi.getState().set({ addProjectOpen: true });
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex max-w-[600px] min-w-0 flex-[1_1_460px] flex-col gap-4 rounded-hero border-[1.5px] border-ink bg-card p-6 shadow-hero"
    >
      <h2 id={headingId} className="font-display text-[22px] font-bold">
        {format(copy.welcome.backTitle, { name: MOCK_USER.firstName })}
      </h2>
      <ul className="flex max-h-[420px] flex-wrap gap-3 overflow-y-auto">
        {projects.map((project) => {
          const run = runs[project.id];
          const caption =
            run?.phase === 'audit'
              ? format(copy.welcome.backRunning, { step: run.step })
              : (LAST_RUN_CAPTIONS[project.id] ?? copy.welcome.backNeverRun);
          return (
            <li
              key={project.id}
              className="flex flex-[1_1_240px] flex-col gap-1 rounded-card border border-ink p-3.5"
            >
              <strong>{project.name}</strong>
              <span className="text-[14px] text-muted">{caption}</span>
              <button
                type="button"
                onClick={() => openProject(project.id)}
                aria-label={`${copy.welcome.backOpen} ${project.name}`}
                className="self-start text-[14px] font-semibold text-cobalt-ink underline hover:text-cobalt-deep"
              >
                {copy.welcome.backOpen}
              </button>
            </li>
          );
        })}
        <li className="flex flex-[1_1_240px] items-center justify-center rounded-card border-[1.5px] border-dashed border-ink p-3.5">
          <Button variant="primary" size="md" onClick={openAddProject}>
            {copy.welcome.backAnother}
          </Button>
        </li>
      </ul>
    </section>
  );
}
