// Dev-only component gallery (SPEC §5.4, M1). Not shipped in production builds, so its
// demo labels live here rather than in copy.ts (see DECISIONS.md).
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  FolderOpen,
  Mic,
  RotateCw,
  Settings,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import type { Severity } from '@fitts/schema';
import { BeforeAfterSlider } from '../../components/BeforeAfterSlider';
import { Button, type ButtonSize, type ButtonVariant } from '../../components/Button';
import { Chip, FilterChip, SeverityBadge, type ChipTone } from '../../components/Chip';
import { Checkbox, RadioCard, Select, Switch, TextField } from '../../components/fields';
import { IconButton } from '../../components/IconButton';
import { Kbd } from '../../components/Kbd';
import { Panel } from '../../components/Panel';
import { SegmentedControl } from '../../components/SegmentedControl';
import { CostChip, MicOnChip, ProgressBar, StatusDot } from '../../components/StatusChips';
import { Stepper } from '../../components/Stepper';
import { Tabs } from '../../components/Tabs';
import { FittsAvatar } from '../../components/brand/FittsAvatar';
import { FittsMark } from '../../components/brand/FittsMark';
import { Wordmark } from '../../components/brand/Wordmark';
import { Menu } from '../../components/overlay/Menu';
import { Modal } from '../../components/overlay/Modal';
import { Popover } from '../../components/overlay/Popover';
import { useToasts } from '../../state/toasts';

const MODES = [
  { value: 'plan', label: 'Plan only' },
  { value: 'ask-every', label: 'Ask every action' },
  { value: 'ask-unsure', label: 'Ask when unsure' },
  { value: 'autonomous', label: 'Autonomous' },
];

const SECTIONS = [
  ['brand', 'Brand'],
  ['buttons', 'Buttons'],
  ['icon-buttons', 'Icon buttons'],
  ['segmented', 'Segmented control'],
  ['fields', 'Fields'],
  ['choices', 'Choices'],
  ['chips', 'Chips & severity'],
  ['stepper', 'Stepper'],
  ['status', 'Status'],
  ['panel', 'Panel'],
  ['slider', 'Before / after'],
  ['tabs', 'Tabs'],
  ['overlays', 'Overlays'],
  ['kbd', 'Kbd'],
] as const;

export function Gallery() {
  return (
    <div className="flex h-full flex-col gap-3.5 px-5 pb-5">
      <header className="flex flex-none items-center gap-3 pt-3">
        <Wordmark />
        <h1 className="font-display text-[26px] font-extrabold tracking-[-0.02em]">
          Component gallery
        </h1>
        <span className="text-[13px] text-muted">Dev only · SPEC §5.4</span>
        <a href="#/" className="ml-auto text-[14px] font-semibold text-cobalt-ink">
          Back to app
        </a>
      </header>
      <div className="flex min-h-0 flex-1 gap-3.5">
        <nav
          aria-label="Gallery sections"
          className="flex w-[210px] flex-none flex-col gap-1 self-start rounded-panel border-[1.5px] border-ink bg-card p-2 shadow-panel"
        >
          {SECTIONS.map(([id, name]) => (
            <a
              key={id}
              href={`#/gallery`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`g-${id}`)?.scrollIntoView({ block: 'start' });
              }}
              className="rounded-control px-3.5 py-2 text-[14px] font-semibold text-ink hover:bg-paper"
            >
              {name}
            </a>
          ))}
        </nav>
        <Panel label="Components" className="flex-1" bodyClassName="flex flex-col gap-8 pt-4">
          <BrandSection />
          <ButtonsSection />
          <IconButtonsSection />
          <SegmentedSection />
          <FieldsSection />
          <ChoicesSection />
          <ChipsSection />
          <StepperSection />
          <StatusSection />
          <PanelSection />
          <SliderSection />
          <TabsSection />
          <OverlaysSection />
          <KbdSection />
        </Panel>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={`g-${id}`}
      aria-labelledby={`g-${id}-h`}
      className="flex scroll-mt-4 flex-col gap-3"
    >
      <h2 id={`g-${id}-h`} className="font-display text-[20px] font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {label && (
        <span className="w-28 flex-none text-[12px] font-semibold text-muted">{label}</span>
      )}
      {children}
    </div>
  );
}

function BrandSection() {
  const [speaking, setSpeaking] = useState(true);
  return (
    <Section id="brand" title="Brand">
      <Row label="Mark">
        <FittsMark size={30} />
        <FittsMark size={40} />
        <FittsMark size={64} />
        <div className="flex size-[200px] items-center justify-center rounded-card bg-surface-2">
          <FittsMark size={140} title="Fitts" />
        </div>
      </Row>
      <Row label="Wordmark">
        <Wordmark />
      </Row>
      <Row label="Avatar">
        <FittsAvatar size={36} />
        <FittsAvatar size={44} />
        <FittsAvatar size={44} speaking={speaking} />
        <Button size="inline" onClick={() => setSpeaking((s) => !s)}>
          {speaking ? 'Stop speaking' : 'Speak'}
        </Button>
      </Row>
    </Section>
  );
}

const VARIANTS: { variant: ButtonVariant; label: string }[] = [
  { variant: 'primary', label: 'Start the audit' },
  { variant: 'secondary', label: 'Change the fix' },
  { variant: 'dark', label: "Don't do it" },
  { variant: 'danger', label: 'Stop run' },
  { variant: 'danger-outline', label: 'Allow once' },
  { variant: 'ghost-dashed', label: 'Show 12 steps I took' },
];

const SIZES: ButtonSize[] = ['inline', 'sm', 'md', 'lg'];

function ButtonsSection() {
  return (
    <Section id="buttons" title="Buttons">
      {VARIANTS.map(({ variant, label }) => (
        <Row key={variant} label={variant}>
          {SIZES.map((size) => (
            <Button key={size} variant={variant} size={size}>
              {label}
            </Button>
          ))}
          <Button variant={variant} disabled>
            Disabled
          </Button>
        </Row>
      ))}
      <Row label="With icon">
        <Button size="sm" icon={<FolderOpen size={16} aria-hidden="true" />}>
          Browse
        </Button>
        <Button variant="primary" size="lg" className="w-[320px]">
          Open my project
        </Button>
      </Row>
    </Section>
  );
}

function IconButtonsSection() {
  const [muted, setMuted] = useState(false);
  return (
    <Section id="icon-buttons" title="Icon buttons">
      <Row label="Header 40px">
        <IconButton aria-label="Brief" icon={<FileText size={18} aria-hidden="true" />} />
        <IconButton aria-label="Settings" icon={<Settings size={18} aria-hidden="true" />} />
        <IconButton
          aria-label="Close"
          icon={<X size={15} strokeWidth={2.5} aria-hidden="true" />}
        />
        <IconButton
          aria-label="Mute Fitts's voice"
          aria-pressed={muted}
          onClick={() => setMuted((m) => !m)}
          icon={<Volume2 size={18} aria-hidden="true" />}
        />
        <IconButton
          aria-label="Settings"
          disabled
          icon={<Settings size={18} aria-hidden="true" />}
        />
      </Row>
      <Row label="Toolbar 36px">
        <IconButton size="sm" aria-label="Back" icon={<ArrowLeft size={16} aria-hidden="true" />} />
        <IconButton
          size="sm"
          aria-label="Forward"
          icon={<ArrowRight size={16} aria-hidden="true" />}
        />
        <IconButton
          size="sm"
          aria-label="Reload"
          icon={<RotateCw size={16} aria-hidden="true" />}
        />
      </Row>
      <Row label="Composer 46px">
        <IconButton
          size="stop"
          variant="danger-outline"
          aria-label="Stop what Fitts is doing"
          icon={<Square size={16} fill="currentColor" aria-hidden="true" />}
        />
        <IconButton
          size="round"
          variant="primary"
          aria-label="Talk to Fitts"
          icon={<Mic size={20} aria-hidden="true" />}
        />
      </Row>
    </Section>
  );
}

function SegmentedSection() {
  const [paused, setPaused] = useState(false);
  const [profile, setProfile] = useState('quality');
  return (
    <Section id="segmented" title="Segmented control">
      <Row label="Run controls">
        <SegmentedControl
          label="Run controls"
          segments={[
            {
              id: 'pause',
              label: paused ? 'Resume' : 'Pause',
              onClick: () => setPaused((p) => !p),
            },
            { id: 'wheel', label: 'Take the wheel' },
            { id: 'stop', label: 'Stop run', tone: 'danger' },
          ]}
        />
      </Row>
      <Row label="Model profile">
        <div className="w-[420px]">
          <SegmentedControl
            label="Model profile"
            size="md"
            fill
            selected={profile}
            onSelect={setProfile}
            segments={[
              { id: 'quality', label: 'Quality' },
              { id: 'economy', label: 'Economy' },
              { id: 'open', label: 'Open weights', disabled: true },
            ]}
          />
        </div>
      </Row>
    </Section>
  );
}

function FieldsSection() {
  const [mode, setMode] = useState('ask-unsure');
  return (
    <Section id="fields" title="Fields">
      <Row label="Select">
        <Select
          label="Permission mode"
          hideLabel
          options={MODES}
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        />
        <Select
          label="How much should I ask you?"
          size="lg"
          className="w-[320px]"
          options={MODES}
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        />
        <Select label="Disabled" hideLabel options={MODES} disabled defaultValue="plan" />
      </Row>
      <div className="grid max-w-[760px] grid-cols-2 gap-4">
        <TextField
          label="Meta Model API key"
          type="password"
          defaultValue="meta-key-placeholder"
          trailing={
            <Chip tone="mint" className="self-center px-2.5 py-1.5">
              Works
            </Chip>
          }
        />
        <TextField
          label="Project folder"
          mono
          defaultValue="~/code/fitts/demo/chat"
          hint="Vite + React 19 · dev server on localhost:5173 · you own it"
          trailing={
            <Button size="md" icon={<FolderOpen size={16} aria-hidden="true" />}>
              Browse
            </Button>
          }
        />
        <TextField
          label="Spending cap per run"
          defaultValue="$20.00"
          error="Enter an amount, like $20."
        />
        <TextField label="Name" defaultValue="portfolio" disabled />
        <TextField label="Find a project" hideLabel placeholder="Find a project…" size="md" />
      </div>
    </Section>
  );
}

function ChoicesSection() {
  const [pm, setPm] = useState('ask-unsure');
  const [speaks, setSpeaks] = useState(true);
  const [shapes, setShapes] = useState(false);
  const legendId = useId();
  return (
    <Section id="choices" title="Choices">
      <div className="grid max-w-[760px] grid-cols-2 gap-6">
        <fieldset aria-labelledby={legendId} className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend id={legendId} className="mb-1.5 text-[14px] font-semibold">
            How much should Fitts ask you?
          </legend>
          {MODES.map((m) => (
            <RadioCard
              key={m.value}
              name="g-pm"
              value={m.value}
              checked={pm === m.value}
              onChange={() => setPm(m.value)}
            >
              <strong>{m.label}</strong>
            </RadioCard>
          ))}
        </fieldset>
        <div className="flex flex-col gap-2">
          <Checkbox label="Install the Fitts plugin with a small pull request" defaultChecked />
          <Checkbox label="I understand this may delete data on localhost:5173" tone="danger" />
          <Checkbox label="Contributor mode · cheaper, Meta may train on your code" boxEnd />
          <Checkbox label="Disabled" disabled />
          <Switch label="Fitts speaks out loud" checked={speaks} onChange={setSpeaks} />
          <Switch
            label="Floating shapes"
            hint="Still under reduced motion"
            checked={shapes}
            onChange={setShapes}
          />
          <Switch label="Dangerous mode" checked={false} onChange={() => undefined} disabled />
        </div>
      </div>
    </Section>
  );
}

const TONES: ChipTone[] = ['neutral', 'mint', 'cobalt', 'sun', 'lilac', 'coral', 'outline'];
const SEVERITIES: Severity[] = [4, 3, 2, 1];
const FILTERS = ['All', 'Usability', 'Accessibility', 'Performance', 'Look & feel'];

function ChipsSection() {
  const [filter, setFilter] = useState('All');
  return (
    <Section id="chips" title="Chips & severity">
      <Row label="Badges">
        {TONES.map((tone) => (
          <Chip key={tone} tone={tone}>
            {tone}
          </Chip>
        ))}
      </Row>
      <Row label="Status chips">
        {['git', 'GitHub · AllenZheng-05', 'Node 22', 'Muse Code'].map((t) => (
          <Chip key={t} tone="mint" size="md">
            {t}
          </Chip>
        ))}
        <Chip tone="sun" size="md">
          You&apos;re driving
        </Chip>
      </Row>
      {(['short', 'list', 'detail'] as const).map((form) => (
        <Row key={form} label={`Severity · ${form}`}>
          {SEVERITIES.map((s) => (
            <SeverityBadge key={s} severity={s} form={form} />
          ))}
        </Row>
      ))}
      <Row label="Filter chips">
        <div role="group" aria-label="Filter findings" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <FilterChip key={f} pressed={filter === f} onClick={() => setFilter(f)}>
              {f}
            </FilterChip>
          ))}
        </div>
      </Row>
    </Section>
  );
}

function StepperSection() {
  return (
    <Section id="stepper" title="Stepper">
      <Row label="Interview">
        <Stepper active="interview" />
      </Row>
      <Row label="Audit, counter">
        <Stepper active="audit" counter="2 fixing" />
      </Row>
      <Row label="Redesign">
        <Stepper active="audit" counter="redesigning" />
      </Row>
      <Row label="Done">
        <Stepper active="done" />
      </Row>
    </Section>
  );
}

function StatusSection() {
  return (
    <Section id="status" title="Status">
      <Row label="Mic on">
        <MicOnChip />
      </Row>
      <Row label="Cost">
        <CostChip spentUsd={1.84} capUsd={20} />
        <CostChip spentUsd={16.4} capUsd={20} />
        <CostChip spentUsd={13.92} />
      </Row>
      <Row label="Status dots">
        {(
          [
            ['done', '/contacts · done'],
            ['testing', '/compose · testing'],
            ['queued', '/settings · queued'],
          ] as const
        ).map(([status, text]) => (
          <span key={status} className="inline-flex items-center gap-2 font-mono text-[12px]">
            <StatusDot status={status} />
            {text}
          </span>
        ))}
      </Row>
      <Row label="Progress">
        <div className="flex w-[300px] flex-col gap-1.5 rounded-control bg-surface-2 p-2.5">
          <span className="text-[12px] font-bold">Controls tried · 14 of 24</span>
          <ProgressBar label="Controls tried" value={14 / 24} />
        </div>
        <div className="flex w-[300px] flex-col gap-1.5">
          <span className="text-[13px] font-bold text-cobalt-ink">Fixing…</span>
          <ProgressBar label="Fixing" tone="cobalt" />
        </div>
      </Row>
    </Section>
  );
}

function PanelSection() {
  return (
    <Section id="panel" title="Panel">
      <div className="flex h-[260px] gap-3.5">
        <Panel
          title="Site map"
          className="w-[210px]"
          footer={<span className="text-[12px] font-bold">Controls tried · 14 of 24</span>}
        >
          <ul className="flex flex-col gap-0.5 font-mono text-[12px]">
            {[
              '/',
              '/contacts',
              '/search',
              '/compose',
              '/recipient',
              '/confirm',
              '/settings',
              '/admin',
            ].map((route) => (
              <li key={route} className="flex items-center gap-2 rounded-row px-2 py-[7px]">
                <StatusDot status="done" />
                {route}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          title="Fitts"
          divided
          actions={
            <IconButton
              aria-label="Mute Fitts's voice"
              icon={<Volume2 size={18} aria-hidden="true" />}
            />
          }
          className="w-[400px]"
          bodyClassName="pt-3"
        >
          <p className="text-[14px] leading-[1.45]">
            Found the first two from your list. The recipient shows as &quot;(null)&quot;, and this
            button says NEXT while the last one said Send Text.
          </p>
        </Panel>
      </div>
    </Section>
  );
}

function SliderSection() {
  const [value, setValue] = useState(50);
  const [dragging, setDragging] = useState(false);
  return (
    <Section id="slider" title="Before / after">
      <BeforeAfterSlider
        className="h-[140px] max-w-[520px]"
        value={value}
        onChange={setValue}
        onDragChange={setDragging}
        before={<DemoPane label="NEXT" />}
        after={<DemoPane label="Send" fixed />}
      />
      <span className="font-mono text-[12px] text-muted">
        value {value} · {dragging ? 'dragging' : 'idle'}
      </span>
    </Section>
  );
}

function DemoPane({ label, fixed = false }: { label: string; fixed?: boolean }) {
  return (
    <div className="flex h-full items-end justify-center p-3">
      <span
        className={
          fixed
            ? 'rounded-tag bg-cobalt px-4 py-2 text-[13px] font-bold text-card'
            : 'rounded-tag bg-muted px-3 py-1.5 text-[12px] font-bold text-card'
        }
      >
        {label}
      </span>
    </div>
  );
}

function TabsSection() {
  const [tab, setTab] = useState('live');
  return (
    <Section id="tabs" title="Tabs">
      <Tabs
        label="Preview"
        selected={tab}
        onSelect={setTab}
        items={[
          {
            id: 'live',
            label: 'Live preview',
            content: <p className="text-[14px]">Live preview pane</p>,
          },
          {
            id: 'mockup',
            label: 'Mockup',
            content: <p className="text-[14px]">Mockup · not code</p>,
          },
          {
            id: 'evidence',
            label: 'Evidence',
            content: <p className="text-[14px]">4 of 5 agree</p>,
          },
        ]}
      />
    </Section>
  );
}

function OverlaysSection() {
  const [modal, setModal] = useState(false);
  const [gate, setGate] = useState(false);
  const [popover, setPopover] = useState(false);
  const [menu, setMenu] = useState(false);
  const [nested, setNested] = useState(false);
  const popoverRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const nestedRef = useRef<HTMLButtonElement>(null);
  const denyRef = useRef<HTMLButtonElement>(null);
  const showToast = useToasts((s) => s.show);

  return (
    <Section id="overlays" title="Overlays">
      <Row>
        <Button size="sm" onClick={() => setModal(true)} data-testid="open-modal">
          Open modal
        </Button>
        <Button size="sm" onClick={() => setGate(true)} data-testid="open-gate">
          Open destructive gate
        </Button>
        <Button
          ref={popoverRef}
          size="sm"
          aria-expanded={popover}
          onClick={() => setPopover((o) => !o)}
          data-testid="open-popover"
        >
          Open popover
        </Button>
        <Button
          ref={menuRef}
          size="sm"
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((o) => !o)}
        >
          Open menu
        </Button>
        <Button size="sm" onClick={() => showToast('Report saved')}>
          Show toast
        </Button>
      </Row>

      <Modal open={modal} onClose={() => setModal(false)} labelledBy="g-modal-title" width={640}>
        <div className="flex items-start gap-3 border-b border-ink px-5 py-4">
          <h2 id="g-modal-title" className="mr-auto font-display text-[26px] font-extrabold">
            Add a project
          </h2>
          <IconButton
            aria-label="Close"
            onClick={() => setModal(false)}
            icon={<X size={15} strokeWidth={2.5} aria-hidden="true" />}
          />
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <TextField label="Name" defaultValue="portfolio" />
          <Button
            ref={nestedRef}
            size="sm"
            aria-expanded={nested}
            onClick={() => setNested((o) => !o)}
            className="self-start"
          >
            Open a popover inside
          </Button>
          <Popover open={nested} onClose={() => setNested(false)} anchorRef={nestedRef} width={280}>
            <p className="p-4 text-[14px]">Esc closes me first, then the dialog.</p>
          </Popover>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink px-5 py-3">
          <Button size="md" onClick={() => setModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={() => setModal(false)}>
            Add and open
          </Button>
        </div>
      </Modal>

      <Modal
        open={gate}
        onClose={() => setGate(false)}
        labelledBy="g-gate-title"
        role="alertdialog"
        tone="danger"
        initialFocusRef={denyRef}
      >
        <div className="bg-danger px-5 py-4">
          <h2 id="g-gate-title" className="font-display text-[22px] font-extrabold text-card">
            This could delete real data
          </h2>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <Checkbox label="I understand this may delete data on localhost:5173" tone="danger" />
          <div className="flex flex-wrap gap-2">
            <Button ref={denyRef} variant="dark" size="md" onClick={() => setGate(false)}>
              Don&apos;t do it
            </Button>
            <Button size="md">Test something else</Button>
            <Button variant="danger-outline" size="md" disabled>
              Allow once
            </Button>
          </div>
        </div>
      </Modal>

      <Popover
        open={popover}
        onClose={() => setPopover(false)}
        anchorRef={popoverRef}
        width={360}
        aria-label="Brief"
      >
        <div className="flex flex-col gap-3 p-4">
          <h3 className="font-display text-[18px] font-bold">Brief</h3>
          <TextField label="For" defaultValue="Families keeping in touch" size="md" />
          <Button
            variant="primary"
            size="sm"
            onClick={() => setPopover(false)}
            className="self-end"
          >
            Save
          </Button>
        </div>
      </Popover>

      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        anchorRef={menuRef}
        label="Project"
        items={[
          { id: 'a', label: 'demo/chat', onSelect: () => undefined },
          { id: 'b', label: 'hartwell-site', onSelect: () => undefined },
          { id: 'c', label: 'portfolio', onSelect: () => undefined, disabled: true },
        ]}
      />
    </Section>
  );
}

function KbdSection() {
  return (
    <Section id="kbd" title="Kbd">
      <Row label="Shortcuts">
        <span className="text-[13px]">
          Stop <Kbd keys={['mod', '.']} />
        </span>
        <span className="text-[13px]">
          Pause <Kbd keys={['mod', 'shift', 'P']} />
        </span>
        <span className="text-[13px]">
          Talk <Kbd keys={['alt', 'Space']} />
        </span>
        <span className="flex items-center gap-2 rounded-row bg-cobalt-tint px-2.5 py-[7px] text-[13px]">
          Now: tapping NEXT and timing the response
          <Kbd keys={['mod', '.']} className="text-cobalt-deep" />
          <span className="font-mono text-[12px] text-cobalt-deep">stops it</span>
        </span>
      </Row>
    </Section>
  );
}
