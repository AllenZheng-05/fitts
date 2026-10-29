import { ChevronDown } from 'lucide-react';
import {
  useId,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cx } from '../lib/cx';

const LABEL = 'text-[14px] font-semibold text-ink';
const HINT = 'text-[13px] text-muted';

/** `md` 40px header · `lg` 46px forms (SPEC §5.3). */
type FieldSize = 'md' | 'lg';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label: string;
  hideLabel?: boolean;
  options: SelectOption[];
  size?: FieldSize;
}

/** Native select styled to match (SPEC §5.4). */
export function Select({
  label,
  hideLabel = false,
  options,
  size = 'md',
  className,
  id,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={selectId} className={hideLabel ? 'sr-only' : LABEL}>
        {label}
      </label>
      <div className="relative flex">
        <select
          id={selectId}
          className={cx(
            'w-full appearance-none rounded-control border border-ink bg-card pr-8 text-ink',
            size === 'md' ? 'min-h-10 pl-2.5 text-[14px]' : 'min-h-[46px] pl-3 text-[15px]',
          )}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2"
        />
      </div>
    </div>
  );
}

interface TextFieldProps extends Omit<ComponentProps<'input'>, 'size'> {
  label: string;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | undefined;
  /** Geist Mono 13px, for folders, URLs and keys. */
  mono?: boolean;
  /** Rendered after the input on the same row: a status chip or a "Browse" button. */
  trailing?: ReactNode;
  size?: FieldSize;
}

/** Label, optional hint and error, 46px input (SPEC §5.4). */
export function TextField({
  label,
  hideLabel = false,
  hint,
  error,
  mono = false,
  trailing,
  size = 'lg',
  className,
  id,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : LABEL}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(
            'min-w-0 flex-1 rounded-control border border-ink bg-card px-3.5 text-ink placeholder:text-muted',
            size === 'lg' ? 'min-h-[46px]' : 'min-h-10',
            mono ? 'font-mono text-[13px]' : 'text-[15px]',
          )}
          {...rest}
        />
        {trailing}
      </div>
      {hint && (
        <span id={hintId} className={HINT}>
          {hint}
        </span>
      )}
      {/* Errors are problems, not destructive actions, so they use coral, not red. */}
      {error && (
        <span
          id={errorId}
          className="self-start rounded-row bg-coral-tint px-2.5 py-1 text-[13px] font-semibold text-coral-ink"
        >
          {error}
        </span>
      )}
    </div>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  /** `danger` only for the destructive-action gate. */
  tone?: 'cobalt' | 'danger';
  /** Put the box on the right, like Settings rows. */
  boxEnd?: boolean;
}

export function Checkbox({
  label,
  tone = 'cobalt',
  boxEnd = false,
  className,
  ...rest
}: CheckboxProps) {
  const box = (
    <input
      type="checkbox"
      className={cx(
        'm-0 size-[22px] flex-none',
        tone === 'danger' ? 'accent-danger' : 'accent-cobalt',
      )}
      {...rest}
    />
  );
  return (
    <label
      className={cx(
        'flex gap-2.5 text-[14px] leading-[1.45]',
        boxEnd ? 'min-h-11 items-center justify-between' : 'items-start',
        className,
      )}
    >
      {!boxEnd && box}
      <span>{label}</span>
      {boxEnd && box}
    </label>
  );
}

interface RadioCardProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  children: ReactNode;
}

/** Radio row; the selected row has a 2px cobalt border and cobalt-tint fill (SPEC §6.13). */
export function RadioCard({ children, className, ...rest }: RadioCardProps) {
  return (
    <label
      className={cx(
        'flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-ink px-3 text-[14px]',
        'has-checked:border-2 has-checked:border-cobalt has-checked:bg-cobalt-tint has-checked:px-[11px]',
        className,
      )}
    >
      <input type="radio" className="m-0 size-4 flex-none accent-cobalt" {...rest} />
      <span>{children}</span>
    </label>
  );
}

interface SwitchProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: ReactNode;
}

/** On/off toggle for Settings. The references have no switch, see DECISIONS.md. */
export function Switch({ label, checked, onChange, disabled = false, hint }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-[14px]">
          {label}
        </label>
        {hint && <span className={HINT}>{hint}</span>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-[26px] w-11 flex-none rounded-pill border-[1.5px] border-ink transition-tint',
          'disabled:cursor-not-allowed disabled:opacity-40',
          checked ? 'bg-cobalt' : 'bg-card',
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            'absolute top-1/2 left-[3px] size-[17px] -translate-y-1/2 rounded-full border-[1.5px] border-ink transition-transform duration-150',
            checked ? 'translate-x-[17px] bg-card' : 'bg-ink',
          )}
        />
      </button>
    </div>
  );
}
