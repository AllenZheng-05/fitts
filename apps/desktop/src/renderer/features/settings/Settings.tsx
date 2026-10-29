import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { Checkbox, RadioCard, Select, Switch, TextField } from '../../components/fields';
import { Modal } from '../../components/overlay/Modal';
import { SegmentedControl } from '../../components/SegmentedControl';
import { copy } from '../../copy';
import { cx } from '../../lib/cx';
import { format, formatUsd } from '../../lib/format';
import { shortcutLabel } from '../../lib/platform';
import { speak } from '../../lib/speech';
import { RichText } from '../../components/RichText';
import { isKeyValid } from '../../mock/detect';
import { removeProject, setDangerous, setPermissionMode } from '../../state/actions';
import { useProjects } from '../../state/projects';
import {
  useSettings,
  type KeyName,
  type ShapeMovement,
  type TalkMode,
  type UserMode,
  type VoiceName,
} from '../../state/settings';
import { useUi, type SettingsTab } from '../../state/ui';

const TABS: SettingsTab[] = ['run', 'voice', 'keys', 'projects'];
const MODES: UserMode[] = ['plan', 'ask-every', 'ask-unsure', 'autonomous'];

/** Full-window Settings with four tabs (SPEC §6.13). Esc or "Back" returns. */
export function Settings() {
  const tab = useUi((s) => s.settingsTab);
  const returnTo = useUi((s) => s.settingsReturnTo);
  const hasProject = useProjects((s) => Boolean(s.lastOpenId));
  const close = useUi((s) => s.closeSettings);
  const backToWorkspace = returnTo === 'workspace' && hasProject;

  return (
    <div data-backdrop className="relative flex h-full flex-col">
      <div className="flex flex-none items-center gap-3 px-7 py-[18px]">
        <h1 className="mr-auto font-display text-[32px] font-extrabold tracking-[-0.02em]">
          {copy.settings.title}
        </h1>
        <Button size="sm" className="px-4 text-[15px]" onClick={close}>
          {backToWorkspace ? copy.settings.back : copy.settings.backToWelcome}
        </Button>
      </div>
      <div data-backdrop className="flex min-h-0 flex-1 gap-[18px] px-7 pb-6">
        <nav
          aria-label={copy.settings.nav}
          className="flex w-[210px] flex-none flex-col gap-1 self-start rounded-panel border-[1.5px] border-ink bg-card p-2 shadow-panel"
        >
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => useUi.setState({ settingsTab: id })}
              className={cx(
                'rounded-control px-3.5 py-[11px] text-left font-semibold transition-tint',
                tab === id ? 'bg-ink text-card' : 'text-ink hover:bg-paper',
              )}
            >
              {copy.settings.tabs[id]}
            </button>
          ))}
        </nav>
        {tab === 'run' && <RunTab />}
        {tab === 'voice' && <VoiceTab />}
        {tab === 'keys' && <KeysTab />}
        {tab === 'projects' && <ProjectsTab />}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cx(
        'flex max-h-full min-w-0 flex-[1_1_0] flex-col gap-3 overflow-y-auto rounded-panel border-[1.5px] border-ink bg-card p-5 shadow-panel',
        className,
      )}
    >
      <h2 id={id} className="font-display text-[20px] font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function RunTab() {
  const s = useSettings();
  const [typed, setTyped] = useState('');
  const [cap, setCap] = useState(formatUsd(s.capUsd));
  const [capError, setCapError] = useState<string | undefined>();
  const legendId = useId();
  const unlocked = typed.trim() === copy.settings.dangerPhrase || s.dangerous;

  return (
    <>
      <Section title={copy.settings.permissions}>
        <fieldset aria-labelledby={legendId} className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend id={legendId} className="mb-1.5 text-[14px] font-semibold">
            {copy.settings.permissionsLegend}
          </legend>
          {MODES.map((mode) => (
            <RadioCard
              key={mode}
              name="permission-mode"
              value={mode}
              checked={s.defaultMode === mode}
              onChange={() => setPermissionMode(mode)}
            >
              <strong>{copy.modes[mode]}</strong>
              {copy.settings.permissionRows[mode] && ` · ${copy.settings.permissionRows[mode]}`}
            </RadioCard>
          ))}
        </fieldset>
        <p className="rounded-control bg-sun-tint px-3 py-2.5 text-[13px] leading-normal">
          <RichText text={copy.settings.alwaysAsks} />
        </p>
        <div className="flex flex-col gap-2 rounded-card border-[1.5px] border-dashed border-danger p-3.5">
          <span className="font-display text-[16px] font-bold text-danger-ink">
            {copy.settings.dangerTitle}
          </span>
          <span className="text-[13px] leading-normal">{copy.settings.dangerBody}</span>
          <TextField
            label={format(copy.settings.dangerTypeLabel, { phrase: copy.settings.dangerPhrase })}
            size="md"
            value={typed}
            autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
          />
          <Switch
            label={copy.settings.dangerToggle}
            checked={s.dangerous}
            disabled={!unlocked}
            hint={unlocked ? undefined : copy.settings.dangerLocked}
            onChange={(on) => setDangerous(on)}
          />
          <div className="flex flex-wrap items-center gap-2.5 rounded-control border-[1.5px] border-ink bg-danger px-3 py-[9px] text-card">
            <strong className="text-[12px] tracking-[0.04em]">{copy.workspace.dangerBanner}</strong>
            <span className="flex-[1_1_160px] text-[13px]">{copy.settings.dangerPreview}</span>
          </div>
        </div>
      </Section>

      <Section title={copy.settings.budget} className="self-start">
        <TextField
          label={copy.settings.cap}
          value={cap}
          error={capError}
          hint={copy.settings.capHint}
          onChange={(e) => setCap(e.target.value)}
          onBlur={() => {
            const amount = Number(cap.replace(/[$,\s]/g, ''));
            if (!Number.isFinite(amount) || amount <= 0) {
              setCapError(copy.settings.capError);
              return;
            }
            setCapError(undefined);
            s.set({ capUsd: amount });
            setCap(formatUsd(amount));
          }}
        />
        <span className="text-[14px] font-semibold">{copy.settings.profile}</span>
        <SegmentedControl
          label={copy.settings.profile}
          size="md"
          fill
          selected={s.modelProfile}
          onSelect={(id) => s.set({ modelProfile: id as typeof s.modelProfile })}
          segments={[
            { id: 'quality', label: copy.settings.profiles.quality },
            { id: 'economy', label: copy.settings.profiles.economy },
            { id: 'open', label: copy.settings.profiles.open, disabled: !s.keys.baseten },
          ]}
        />
        {!s.keys.baseten && (
          <span className="text-[13px] text-muted">
            {copy.settings.openWeightsNeedsKey}{' '}
            <button
              type="button"
              className="text-cobalt-ink underline hover:text-cobalt-deep"
              onClick={() => useUi.setState({ settingsTab: 'keys' })}
            >
              {copy.settings.addBaseten}
            </button>
          </span>
        )}
        <Checkbox
          label={copy.settings.contributor}
          boxEnd
          checked={s.contributorMode}
          onChange={(e) => s.set({ contributorMode: e.target.checked })}
        />
      </Section>
    </>
  );
}

const MOVEMENTS: ShapeMovement[] = ['still', 'gentle', 'lively'];

function VoiceTab() {
  const s = useSettings();
  const sliderId = useId();
  const movementIndex = MOVEMENTS.indexOf(s.shapeMovement);
  const altKey = shortcutLabel(['alt']);

  return (
    <>
      <Section title={copy.settings.voiceTitle}>
        <Switch
          label={copy.settings.speaksAloud}
          checked={s.speaksAloud}
          onChange={(on) => s.set({ speaksAloud: on })}
        />
        <div className="flex items-end gap-2">
          <Select
            label={copy.settings.voice}
            size="lg"
            className="flex-1"
            value={s.voice}
            onChange={(e) => s.set({ voice: e.target.value as VoiceName })}
            options={(['elevenlabs', 'system'] as const).map((v) => ({
              value: v,
              label: copy.settings.voices[v],
            }))}
          />
          <Button
            size="md"
            className="min-h-[46px]"
            onClick={() => speak(copy.settings.previewLine)}
          >
            {copy.settings.preview}
          </Button>
        </div>
        <Select
          label={copy.settings.talkMode}
          size="lg"
          value={s.talkMode}
          onChange={(e) => s.set({ talkMode: e.target.value as TalkMode })}
          options={(['hold', 'wake', 'typing'] as const).map((m) => ({
            value: m,
            label: format(copy.settings.talkModes[m], { alt: altKey }),
          }))}
        />
        <p className="rounded-control bg-surface-2 px-3 py-2.5 text-[13px] leading-normal">
          {copy.settings.wakeNote}
        </p>
      </Section>
      <Section title={copy.settings.appearance} className="self-start">
        <Switch
          label={copy.settings.shapes}
          hint={copy.settings.shapesHint}
          checked={s.shapesOn}
          onChange={(on) => s.set({ shapesOn: on })}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={sliderId} className="text-[14px] font-semibold">
            {copy.settings.movement}
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={2}
            step={1}
            value={movementIndex}
            disabled={!s.shapesOn}
            aria-valuetext={copy.settings.movements[s.shapeMovement]}
            onChange={(e) =>
              s.set({ shapeMovement: MOVEMENTS[Number(e.target.value)] ?? 'gentle' })
            }
            className="w-full accent-sun disabled:opacity-40"
          />
          <div className="flex justify-between text-[13px] text-muted" aria-hidden="true">
            {MOVEMENTS.map((m) => (
              <span
                key={m}
                className={m === s.shapeMovement ? 'font-semibold text-ink' : undefined}
              >
                {copy.settings.movements[m]}
              </span>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}

const KEYS: KeyName[] = ['meta', 'elevenlabs', 'baseten'];

function KeysTab() {
  return (
    <Section title={copy.settings.keysTitle} className="max-w-[760px]">
      <ul className="flex flex-col divide-y divide-ink border-y border-ink">
        {KEYS.map((key) => (
          <KeyRow key={key} name={key} />
        ))}
      </ul>
      <p className="text-[13px] text-muted">{copy.settings.keysNote}</p>
    </Section>
  );
}

function KeyRow({ name }: { name: KeyName }) {
  const added = useSettings((s) => s.keys[name]);
  const setKey = useSettings((s) => s.setKey);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const row = copy.settings.keyRows[name];
  const invalid = value.length > 0 && !isKeyValid(value);
  const inputRef = useFocusWhen(editing);

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <strong className="text-[15px]">{row.name}</strong>
          <span className="text-[13px] text-muted">{row.hint}</span>
        </div>
        <Chip tone={added ? 'mint' : 'neutral'}>
          {added ? copy.settings.keyWorks : copy.settings.keyMissing}
        </Chip>
        {!editing && (
          <Button size="sm" onClick={() => setEditing(true)}>
            {added ? copy.settings.keyReplace : copy.settings.keyAdd}
          </Button>
        )}
      </div>
      {editing && (
        <form
          className="flex items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isKeyValid(value)) return;
            setKey(name, true);
            setEditing(false);
            setValue('');
          }}
        >
          <TextField
            label={format(copy.settings.keyInput, { name: row.name })}
            hideLabel
            type="password"
            autoComplete="off"
            size="md"
            className="flex-1"
            ref={inputRef}
            value={value}
            error={invalid ? copy.settings.keyError : undefined}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" variant="primary" size="sm" disabled={!isKeyValid(value)}>
            {copy.settings.keySave}
          </Button>
          <Button size="sm" onClick={() => setEditing(false)}>
            {copy.overlay.cancel}
          </Button>
        </form>
      )}
    </li>
  );
}

function ProjectsTab() {
  const projects = useProjects((s) => s.projects);
  const [removing, setRemoving] = useState<string | null>(null);
  const target = projects.find((p) => p.id === removing);
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Section title={copy.settings.projectsTitle} className="max-w-[760px]">
      {projects.length === 0 ? (
        <p className="text-[14px] text-muted">{copy.settings.noProjects}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-ink border-y border-ink">
          {projects.map((p) => (
            <ProjectRow key={p.id} id={p.id} onRemove={() => setRemoving(p.id)} />
          ))}
        </ul>
      )}
      <Modal
        open={target !== undefined}
        onClose={() => setRemoving(null)}
        labelledBy="remove-project-title"
        describedBy="remove-project-body"
        width={480}
        initialFocusRef={cancelRef}
      >
        <div className="flex flex-col gap-3 p-6">
          <h2 id="remove-project-title" className="font-display text-[22px] font-bold">
            {format(copy.settings.removeTitle, { name: target?.name ?? '' })}
          </h2>
          <p id="remove-project-body" className="text-[14px] leading-normal text-ink-2">
            {copy.settings.removeBody}
          </p>
          <div className="mt-1 flex justify-end gap-2">
            <Button ref={cancelRef} size="md" onClick={() => setRemoving(null)}>
              {copy.overlay.cancel}
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={() => {
                if (target) removeProject(target.id);
                setRemoving(null);
              }}
            >
              {copy.settings.removeConfirm}
            </Button>
          </div>
        </div>
      </Modal>
    </Section>
  );
}

function ProjectRow({ id, onRemove }: { id: string; onRemove: () => void }) {
  const project = useProjects((s) => s.projects.find((p) => p.id === id));
  const rename = useProjects((s) => s.renameProject);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project?.name ?? '');
  const inputRef = useFocusWhen(editing);
  if (!project) return null;
  return (
    <li className="flex items-center gap-3 py-3">
      {editing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) rename(id, name.trim());
            setEditing(false);
          }}
        >
          <TextField
            label={format(copy.settings.renameLabel, { name: project.name })}
            hideLabel
            size="md"
            className="flex-1"
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="primary" size="sm" disabled={!name.trim()}>
            {copy.settings.save}
          </Button>
          <Button size="sm" onClick={() => setEditing(false)}>
            {copy.overlay.cancel}
          </Button>
        </form>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 flex-col">
            <strong className="truncate">{project.name}</strong>
            <span className="truncate font-mono text-[12px] text-muted">
              {project.folder ?? project.url}
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setName(project.name);
              setEditing(true);
            }}
          >
            {copy.settings.rename}
          </Button>
          <Button size="sm" variant="danger-outline" onClick={onRemove}>
            {copy.settings.remove}
          </Button>
        </>
      )}
    </li>
  );
}

/** Focuses an inline editor when the user opens it. */
function useFocusWhen(active: boolean) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (active) ref.current?.focus();
  }, [active]);
  return ref;
}
